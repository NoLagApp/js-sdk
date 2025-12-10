/**
 * NoLag Client
 * WebSocket client for Kraken Proxy with automatic reconnection
 *
 * Subscriptions are persisted server-side - no local tracking needed.
 * On reconnect, the server automatically restores all subscriptions.
 */

import { encode as msgpackEncode, decode as msgpackDecode } from "@msgpack/msgpack";
import {
  NoLagOptions,
  ConnectionStatus,
  ActorType,
  PresenceData,
  ActorPresence,
  MessageMeta,
  EmitOptions,
  SubscribeOptions,
  RestoredSubscription,
  ConnectHandler,
  DisconnectHandler,
  ReconnectHandler,
  ErrorHandler,
  PresenceHandler,
  MessageHandler,
  AckCallback,
  QoS,
  AppContext,
  RoomContext,
} from "./types";
import { IUnifiedWebSocket, WebSocketFactory, WS_READY_STATE } from "./websocket/types";

const DEFAULT_URL = "wss://broker.nolag.app/ws";
const DEFAULT_RECONNECT_INTERVAL = 5000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_HEARTBEAT_INTERVAL = 30000;

type EventHandler =
  | ConnectHandler
  | DisconnectHandler
  | ReconnectHandler
  | ErrorHandler
  | PresenceHandler
  | MessageHandler;

// Internal options type with token included
interface InternalOptions extends Required<Omit<NoLagOptions, 'loadBalanceGroup' | 'actorTokenId' | 'heartbeatInterval'>> {
  token: string;
  actorTokenId?: string;
  loadBalanceGroup?: string;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
}

/**
 * NoLag Client
 *
 * A Socket.IO-style API for real-time messaging via Kraken Proxy.
 *
 * Subscriptions are automatically restored on reconnect by the server.
 *
 * @example
 * ```typescript
 * // Simple connection
 * const client = new NoLag('your_access_token');
 * await client.connect();
 *
 * // Fluent API (recommended)
 * const room = client.setApp('chat').setRoom('general');
 * room.subscribe('messages');
 * room.on('messages', (data) => console.log(data));
 * room.emit('messages', { text: 'Hello!' });
 *
 * // Direct API (full topic paths)
 * client.subscribe('chat/general/messages');
 * client.on('chat/general/messages', (data) => console.log(data));
 * client.emit('chat/general/messages', { text: 'Hello!' });
 *
 * // Worker with load balancing
 * const worker = new NoLag('worker_token', {
 *   loadBalance: true,
 *   loadBalanceGroup: 'worker-pool-1'
 * });
 * ```
 */
export class NoLag {
  private _options: InternalOptions;
  private _createWebSocket: WebSocketFactory;
  private _ws: IUnifiedWebSocket | null = null;
  private _status: ConnectionStatus = "disconnected";
  private _reconnectAttempts = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // Actor info (populated after auth)
  private _actorTokenId: string | null = null;
  private _projectId: string | null = null;
  private _actorType: ActorType | null = null;

  // Presence
  private _presence: PresenceData | null = null;
  private _presenceMap: Map<string, ActorPresence> = new Map();

  // Event handlers (local - for routing messages to callbacks)
  private _eventHandlers: Map<string, Set<EventHandler>> = new Map();

  constructor(
    createWebSocket: WebSocketFactory,
    token: string,
    options?: NoLagOptions
  ) {
    this._createWebSocket = createWebSocket;
    this._options = {
      token,
      url: options?.url ?? DEFAULT_URL,
      actorTokenId: options?.actorTokenId,
      reconnect: options?.reconnect ?? true,
      reconnectInterval: options?.reconnectInterval ?? DEFAULT_RECONNECT_INTERVAL,
      maxReconnectAttempts: DEFAULT_MAX_RECONNECT_ATTEMPTS,
      disconnectOnHidden: options?.disconnectOnHidden ?? false,
      debug: options?.debug ?? false,
      qos: options?.qos ?? 1,
      loadBalance: options?.loadBalance ?? false,
      loadBalanceGroup: options?.loadBalanceGroup,
      heartbeatInterval: options?.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL,
    };

    // Set up visibility change handler for browser
    if (typeof document !== "undefined" && this._options.disconnectOnHidden) {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          this.disconnect();
        } else if (document.visibilityState === "visible" && this._status === "disconnected") {
          this.connect().catch(console.error);
        }
      });
    }
  }

  // ============ Public Properties ============

  get status(): ConnectionStatus {
    return this._status;
  }

  get connected(): boolean {
    return this._status === "connected";
  }

  get actorId(): string | null {
    return this._actorTokenId;
  }

  get actorType(): ActorType | null {
    return this._actorType;
  }

  get projectId(): string | null {
    return this._projectId;
  }

  get loadBalanced(): boolean {
    return this._options.loadBalance;
  }

  get loadBalanceGroup(): string | undefined {
    return this._options.loadBalanceGroup;
  }

  // ============ Connection ============

  /**
   * Connect to NoLag
   *
   * On reconnect, the server automatically restores all previous subscriptions.
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._status === "connected") {
        resolve();
        return;
      }

      if (this._status === "connecting") {
        // Wait for existing connection attempt
        const checkConnection = () => {
          if (this._status === "connected") {
            resolve();
          } else if (this._status === "disconnected") {
            reject(new Error("Connection failed"));
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
        return;
      }

      this._status = "connecting";
      this._log("Connecting to", this._options.url);

      try {
        this._ws = this._createWebSocket(this._options.url);

        this._ws.onOpen = () => {
          this._log("WebSocket opened, authenticating...");
          this._authenticate()
            .then((restoredSubscriptions) => {
              this._status = "connected";
              this._reconnectAttempts = 0;
              this._log("Connected and authenticated");

              if (restoredSubscriptions && restoredSubscriptions.length > 0) {
                this._log("Server restored subscriptions:", restoredSubscriptions);
              }

              this._emitEvent("connect");

              // Start heartbeat
              this._startHeartbeat();

              // Restore presence (client-side only, not persisted on server)
              if (this._presence) {
                this._sendPresence(this._presence);
              }

              resolve();
            })
            .catch((err) => {
              this._log("Authentication failed:", err);
              this._ws?.close();
              reject(err);
            });
        };

        this._ws.onMessage = (data: ArrayBuffer) => {
          this._handleMessage(data);
        };

        this._ws.onClose = (event: any) => {
          const wasConnected = this._status === "connected";
          this._status = "disconnected";
          this._ws = null;

          this._stopHeartbeat();

          if (wasConnected) {
            this._emitEvent("disconnect", event?.reason || "Connection closed");
          }

          // Attempt reconnection
          if (this._options.reconnect && this._reconnectAttempts < this._options.maxReconnectAttempts) {
            this._scheduleReconnect();
          }
        };

        this._ws.onError = (event) => {
          this._log("WebSocket error:", event);
          this._emitEvent("error", new Error("WebSocket error"));

          if (this._status === "connecting") {
            reject(new Error("Connection failed"));
          }
        };
      } catch (err) {
        this._status = "disconnected";
        reject(err);
      }
    });
  }

  /**
   * Disconnect from NoLag
   */
  disconnect(): void {
    this._log("Disconnecting...");
    const wasConnected = this._status === "connected";
    this._options.reconnect = false; // Prevent auto-reconnect

    this._stopHeartbeat();

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this._ws) {
      this._ws.close(1000, "Client disconnect");
      this._ws = null;
    }

    this._status = "disconnected";
    this._presenceMap.clear();

    // Emit disconnect event if we were connected
    if (wasConnected) {
      this._emitEvent("disconnect", "Client disconnect");
    }
  }

  // ============ Presence ============

  /**
   * Set your presence (project-level)
   *
   * Note: Presence is client-side only and will be re-sent on reconnect.
   */
  setPresence(data: PresenceData, callback?: AckCallback): void {
    this._presence = data;

    if (!this.connected || !this._ws) {
      callback?.(new Error("Not connected"));
      return;
    }

    this._sendPresence(data, callback);
  }

  /**
   * Get all present actors in project (local cache)
   */
  getPresence(): ActorPresence[];
  getPresence(actorId: string): ActorPresence | undefined;
  getPresence(actorId?: string): ActorPresence[] | ActorPresence | undefined {
    if (actorId) {
      return this._presenceMap.get(actorId);
    }
    return Array.from(this._presenceMap.values());
  }

  /**
   * Request presence list from server
   */
  fetchPresence(): Promise<ActorPresence[]> {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this._ws) {
        reject(new Error("Not connected"));
        return;
      }

      // Set up one-time handler for presence list response
      const handler = (presenceList: ActorPresence[]) => {
        this.off("presenceList", handler as EventHandler);
        resolve(presenceList);
      };
      this.on("presenceList" as any, handler as any);

      this._send({ type: "getPresence" });

      // Timeout after 5 seconds
      setTimeout(() => {
        this.off("presenceList", handler as EventHandler);
        reject(new Error("Presence request timeout"));
      }, 5000);
    });
  }

  // ============ Topics ============

  /**
   * Subscribe to a topic
   *
   * Subscriptions are persisted server-side and automatically restored on reconnect.
   * Load balancing settings default to connection-level options but can be overridden per-topic.
   *
   * @example
   * ```typescript
   * // Normal subscription - all clients receive all messages
   * client.subscribe("chat/room/messages");
   *
   * // Override load balance for specific topic (if connection default is different)
   * client.subscribe("jobs/process", { loadBalance: true });
   * ```
   */
  subscribe(topic: string, callback?: AckCallback): void;
  subscribe(topic: string, options: SubscribeOptions, callback?: AckCallback): void;
  subscribe(
    topic: string,
    optionsOrCallback?: SubscribeOptions | AckCallback,
    callback?: AckCallback
  ): void {
    const options = typeof optionsOrCallback === "object" ? optionsOrCallback : {};
    const cb = typeof optionsOrCallback === "function" ? optionsOrCallback : callback;

    if (!this.connected || !this._ws) {
      cb?.(new Error("Not connected"));
      return;
    }

    // Use connection-level defaults, allow per-topic override
    const loadBalance = options.loadBalance ?? this._options.loadBalance;
    const loadBalanceGroup = options.loadBalanceGroup ?? this._options.loadBalanceGroup;

    this._log("Subscribing to:", topic, loadBalance ? "(load balanced)" : "");

    this._send({
      type: "subscribe",
      topic,
      loadBalance,
      loadBalanceGroup,
    });

    cb?.(null);
  }

  /**
   * Unsubscribe from a topic
   *
   * This also removes the subscription from server-side persistence.
   */
  unsubscribe(topic: string, callback?: AckCallback): void {
    if (!this.connected || !this._ws) {
      callback?.(new Error("Not connected"));
      return;
    }

    this._log("Unsubscribing from:", topic);
    this._send({ type: "unsubscribe", topic });
    callback?.(null);
  }

  /**
   * Emit/publish to a topic
   */
  emit(
    topic: string,
    data: unknown,
    optionsOrCallback?: EmitOptions | AckCallback,
    callback?: AckCallback
  ): void {
    if (!this.connected || !this._ws) {
      const cb = typeof optionsOrCallback === "function" ? optionsOrCallback : callback;
      cb?.(new Error("Not connected"));
      return;
    }

    const options = typeof optionsOrCallback === "object" ? optionsOrCallback : {};
    const ackCb = typeof optionsOrCallback === "function" ? optionsOrCallback : callback;

    this._log("Emitting to:", topic, data);

    this._send({
      type: "publish",
      topic,
      data,
      qos: options.qos ?? this._options.qos,
      echo: options.echo ?? true,
    });

    ackCb?.(null);
  }

  // ============ Event Handlers ============

  /**
   * Register event handler
   *
   * Note: Event handlers are local to this client instance.
   * They are NOT persisted on the server.
   */
  on(event: "connect", handler: ConnectHandler): this;
  on(event: "disconnect", handler: DisconnectHandler): this;
  on(event: "reconnect", handler: ReconnectHandler): this;
  on(event: "error", handler: ErrorHandler): this;
  on(event: "presence:join", handler: PresenceHandler): this;
  on(event: "presence:leave", handler: PresenceHandler): this;
  on(event: "presence:update", handler: PresenceHandler): this;
  on(event: string, handler: MessageHandler): this;
  on(event: string, handler: EventHandler): this {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event)!.add(handler);
    return this;
  }

  /**
   * Remove event handler
   */
  off(event: string, handler?: EventHandler): this {
    if (handler) {
      this._eventHandlers.get(event)?.delete(handler);
    } else {
      this._eventHandlers.delete(event);
    }
    return this;
  }

  /**
   * Listen to all topic messages
   */
  onAny(handler: (topic: string, data: unknown, meta: MessageMeta) => void): this {
    this.on("*", handler as EventHandler);
    return this;
  }

  // ============ Fluent API ============

  /**
   * Set the app context for scoped pub/sub
   *
   * @example
   * ```typescript
   * const room = client.setApp('chat').setRoom('general');
   *
   * room.subscribe('messages');
   * room.on('messages', (data) => console.log(data));
   * room.emit('messages', { text: 'Hello!' });
   *
   * // Equivalent to:
   * // client.subscribe('chat/general/messages');
   * // client.on('chat/general/messages', ...);
   * // client.emit('chat/general/messages', ...);
   * ```
   */
  setApp(app: string): AppContext {
    return new App(this, app);
  }

  // ============ Private Methods ============

  private _authenticate(): Promise<RestoredSubscription[]> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Authentication timeout"));
      }, 10000);

      // Set up one-time auth response handler
      const authHandler = (msg: any) => {
        if (msg.type === "auth") {
          clearTimeout(timeout);
          if (msg.success) {
            this._actorTokenId = msg.actorTokenId || this._options.actorTokenId || null;
            this._projectId = msg.projectId || null;
            this._actorType = msg.actorType || null;
            // Return restored subscriptions (server returns objects with loadBalance info)
            resolve(msg.restoredSubscriptions || []);
          } else {
            reject(new Error(msg.error || "Authentication failed"));
          }
        }
      };

      // Temporarily store handler
      (this as any)._authHandler = authHandler;

      this._send({
        type: "auth",
        token: this._options.token,
      });
    });
  }

  private _sendPresence(data: PresenceData, callback?: AckCallback): void {
    this._send({ type: "presence", data });
    callback?.(null);
  }

  private _send(message: object): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      this._log("Cannot send, WebSocket not open");
      return;
    }

    const payload = msgpackEncode(message);
    this._ws.send(payload);
  }

  private _handleMessage(data: ArrayBuffer | string): void {
    // Handle empty binary packet (heartbeat response)
    if (data instanceof ArrayBuffer && data.byteLength === 0) {
      this._log("Heartbeat pong received");
      return;
    }

    let message: any;

    try {
      if (data instanceof ArrayBuffer) {
        message = msgpackDecode(new Uint8Array(data));
      } else {
        // Fallback for text messages (JSON)
        message = JSON.parse(data);
      }
    } catch (e) {
      this._log("Failed to decode message:", e);
      return;
    }

    this._log("Received:", message);

    // Handle auth response (during connection)
    if (message.type === "auth" && (this as any)._authHandler) {
      (this as any)._authHandler(message);
      delete (this as any)._authHandler;
      return;
    }

    // Handle different message types
    switch (message.type) {
      case "message":
        this._handleTopicMessage(message);
        break;

      case "presence":
        this._handlePresenceEvent(message);
        break;

      case "presenceList":
        this._handlePresenceList(message);
        break;

      case "subscribed":
        this._log("Subscribed to:", message.topic);
        break;

      case "unsubscribed":
        this._log("Unsubscribed from:", message.topic);
        break;

      case "error":
        this._log("Server error:", message.error);
        this._emitEvent("error", new Error(message.error));
        break;

      default:
        this._log("Unknown message type:", message.type);
    }
  }

  private _handleTopicMessage(message: { topic: string; data: unknown }): void {
    const { topic, data } = message;
    const meta: MessageMeta = {};

    // Emit to specific topic handlers
    this._emitEvent(topic, data, meta);

    // Emit to wildcard handlers
    const anyHandlers = this._eventHandlers.get("*");
    if (anyHandlers) {
      for (const handler of anyHandlers) {
        try {
          (handler as (topic: string, data: unknown, meta: MessageMeta) => void)(topic, data, meta);
        } catch (e) {
          console.error("Error in wildcard handler:", e);
        }
      }
    }
  }

  private _handlePresenceEvent(message: { event: string; data: ActorPresence }): void {
    const { event, data } = message;

    if (!data || !data.actorTokenId) return;

    switch (event) {
      case "join":
        this._presenceMap.set(data.actorTokenId, data);
        this._emitEvent("presence:join", data);
        break;

      case "leave":
        this._presenceMap.delete(data.actorTokenId);
        this._emitEvent("presence:leave", data);
        break;

      case "update":
        this._presenceMap.set(data.actorTokenId, data);
        this._emitEvent("presence:update", data);
        break;
    }
  }

  private _handlePresenceList(message: { data: ActorPresence[] }): void {
    // Update local presence map
    this._presenceMap.clear();
    for (const actor of message.data || []) {
      if (actor.actorTokenId) {
        this._presenceMap.set(actor.actorTokenId, actor);
      }
    }

    // Emit for fetchPresence() promise
    this._emitEvent("presenceList", message.data);
  }

  private _scheduleReconnect(): void {
    if (this._reconnectTimer) return;

    this._reconnectAttempts++;
    const delay = Math.min(
      this._options.reconnectInterval * Math.pow(1.5, this._reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    this._log(`Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})`);
    this._status = "reconnecting";
    this._emitEvent("reconnect");

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect().catch((err) => {
        this._log("Reconnection failed:", err);
      });
    }, delay);
  }

  private _emitEvent(event: string, ...args: unknown[]): void {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          (handler as (...args: unknown[]) => void)(...args);
        } catch (e) {
          console.error("Error in event handler:", e);
        }
      }
    }
  }

  private _log(...args: unknown[]): void {
    if (this._options.debug) {
      console.log("[NoLag]", ...args);
    }
  }

  private _startHeartbeat(): void {
    if (this._options.heartbeatInterval <= 0) {
      return;
    }

    this._stopHeartbeat();

    this._heartbeatTimer = setInterval(() => {
      if (this._ws && this._ws.readyState === WS_READY_STATE.OPEN) {
        // Send empty binary packet as heartbeat
        this._ws.send(new ArrayBuffer(0));
        this._log("Heartbeat ping sent");
      }
    }, this._options.heartbeatInterval);
  }

  private _stopHeartbeat(): void {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }
}

/**
 * Room - Scoped context for pub/sub within an app.room
 *
 * Provides a cleaner API by automatically prefixing topics with app.room
 */
class Room implements RoomContext {
  constructor(
    private _client: NoLag,
    private _app: string,
    private _room: string
  ) {}

  get prefix(): string {
    return `${this._app}/${this._room}`;
  }

  private _fullTopic(topic: string): string {
    return `${this.prefix}/${topic}`;
  }

  subscribe(topic: string, callback?: AckCallback): void;
  subscribe(topic: string, options: SubscribeOptions, callback?: AckCallback): void;
  subscribe(
    topic: string,
    optionsOrCallback?: SubscribeOptions | AckCallback,
    callback?: AckCallback
  ): void {
    const fullTopic = this._fullTopic(topic);
    if (typeof optionsOrCallback === "function") {
      this._client.subscribe(fullTopic, optionsOrCallback);
    } else {
      this._client.subscribe(fullTopic, optionsOrCallback || {}, callback);
    }
  }

  unsubscribe(topic: string, callback?: AckCallback): void {
    this._client.unsubscribe(this._fullTopic(topic), callback);
  }

  emit(topic: string, data: unknown, callback?: AckCallback): void;
  emit(topic: string, data: unknown, options: EmitOptions, callback?: AckCallback): void;
  emit(
    topic: string,
    data: unknown,
    optionsOrCallback?: EmitOptions | AckCallback,
    callback?: AckCallback
  ): void {
    const fullTopic = this._fullTopic(topic);
    if (typeof optionsOrCallback === "function") {
      this._client.emit(fullTopic, data, optionsOrCallback);
    } else {
      this._client.emit(fullTopic, data, optionsOrCallback || {}, callback);
    }
  }

  on(topic: string, handler: MessageHandler): this {
    this._client.on(this._fullTopic(topic), handler);
    return this;
  }

  off(topic: string, handler?: MessageHandler): this {
    this._client.off(this._fullTopic(topic), handler as EventHandler);
    return this;
  }
}

/**
 * App - Intermediate context for setting the room
 */
class App implements AppContext {
  constructor(
    private _client: NoLag,
    private _app: string
  ) {}

  setRoom(room: string): RoomContext {
    return new Room(this._client, this._app, room);
  }
}

// Legacy alias
export { NoLag as NoLagSocket };
