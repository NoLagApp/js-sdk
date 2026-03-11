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
  LobbyPresenceEvent,
  LobbyPresenceState,
  MessageMeta,
  EmitOptions,
  SubscribeOptions,
  RestoredSubscription,
  ConnectHandler,
  DisconnectHandler,
  ReconnectHandler,
  ErrorHandler,
  PresenceHandler,
  LobbyPresenceHandler,
  MessageHandler,
  AckCallback,
  QoS,
  AppContext,
  RoomContext,
  LobbyContext,
  ReplayStartEvent,
  ReplayEndEvent,
  ReplayStartHandler,
  ReplayEndHandler,
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
  | LobbyPresenceHandler
  | MessageHandler
  | ReplayStartHandler
  | ReplayEndHandler;

// Internal options type with token included
interface InternalOptions extends Required<Omit<NoLagOptions, 'loadBalanceGroup' | 'actorTokenId' | 'heartbeatInterval' | 'ackBatchInterval' | 'projectId'>> {
  token: string;
  actorTokenId?: string;
  loadBalanceGroup?: string;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  projectId?: string;
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
  private _isReconnecting = false; // True when reconnecting after disconnect, false on fresh connect

  // Actor info (populated after auth)
  private _actorTokenId: string | null = null;
  private _projectId: string | null = null;
  private _actorType: ActorType | null = null;

  // Presence
  private _presence: PresenceData | null = null;
  private _presenceMap: Map<string, ActorPresence> = new Map();

  // Replay state
  private _isReplaying = false;
  private _replayInfo: { count: number; received: number } | null = null;

  // ACK batching
  private _pendingAcks: string[] = [];
  private _ackTimer: ReturnType<typeof setTimeout> | null = null;
  private _ackBatchInterval = 0; // ms (default: immediate ACKs)

  // Topic filters tracking (topic -> set of filter values)
  private _topicFilters: Map<string, Set<string>> = new Map();

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
      projectId: options?.projectId,
    };
    this._ackBatchInterval = options?.ackBatchInterval ?? 0;

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

  /** Whether we're currently replaying missed messages */
  get isReplayingMessages(): boolean {
    return this._isReplaying;
  }

  /** Current replay progress (count and received), or null if not replaying */
  get replayProgress(): { count: number; received: number } | null {
    return this._replayInfo;
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
              // Reset reconnecting flag after successful connection
              // Next connect() call will be a fresh connect unless scheduled via _scheduleReconnect
              this._isReconnecting = false;
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

    // Use connection-level QoS default, allow per-topic override
    const qos = options.qos ?? this._options.qos;

    // Only include loadBalance fields when actually using load balancing
    const subscribeMessage: { type: string; topic: string; qos: QoS; loadBalance?: boolean; loadBalanceGroup?: string; filters?: string[] } = {
      type: "subscribe",
      topic,
      qos,
    };
    if (loadBalance) {
      subscribeMessage.loadBalance = true;
      if (loadBalanceGroup) {
        subscribeMessage.loadBalanceGroup = loadBalanceGroup;
      }
    }
    // Include filters if provided
    const filters = options.filters;
    if (filters && filters.length > 0) {
      subscribeMessage.filters = filters;
      this._topicFilters.set(topic, new Set(filters));
    }
    this._send(subscribeMessage);

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
   * Replace all filters for a topic.
   * Sends a setFilters message to the server which handles subscribe/unsubscribe diffs.
   * Empty array switches back to wildcard (receive all messages).
   */
  setFilters(topic: string, filters: string[], callback?: AckCallback): void {
    if (!this.connected || !this._ws) {
      callback?.(new Error("Not connected"));
      return;
    }

    this._log("Setting filters for:", topic, filters);

    if (filters.length > 0) {
      this._topicFilters.set(topic, new Set(filters));
    } else {
      this._topicFilters.delete(topic);
    }

    this._send({ type: "setFilters", topic, filters });
    callback?.(null);
  }

  /**
   * Add filters to the existing set for a topic.
   * Merges with current filters and sends the full set to the server.
   */
  addFilters(topic: string, filters: string[], callback?: AckCallback): void {
    const existing = this._topicFilters.get(topic) || new Set<string>();
    for (const f of filters) {
      existing.add(f);
    }
    this.setFilters(topic, Array.from(existing), callback);
  }

  /**
   * Remove specific filters from a topic.
   * Removes from current set and sends the remaining filters to the server.
   */
  removeFilters(topic: string, filters: string[], callback?: AckCallback): void {
    const existing = this._topicFilters.get(topic);
    if (!existing) {
      callback?.(null);
      return;
    }
    for (const f of filters) {
      existing.delete(f);
    }
    this.setFilters(topic, Array.from(existing), callback);
  }

  /**
   * Acknowledge receipt of a message
   *
   * Note: ACKs are automatically sent when messages have `requiresAck: true`.
   * Use this method for manual ACK scenarios.
   */
  ack(msgId: string): void {
    if (!this.connected || !this._ws) {
      this._log("Cannot ACK, not connected");
      return;
    }
    this._queueAck(msgId);
  }

  /**
   * Acknowledge multiple messages at once
   */
  batchAck(msgIds: string[]): void {
    if (!this.connected || !this._ws) {
      this._log("Cannot ACK, not connected");
      return;
    }
    for (const msgId of msgIds) {
      this._queueAck(msgId);
    }
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

    const publishMessage: { type: string; topic: string; data: unknown; qos: QoS; echo: boolean; filter?: string } = {
      type: "publish",
      topic,
      data,
      qos: options.qos ?? this._options.qos,
      echo: options.echo ?? true,
    };
    if (options.filter) {
      publishMessage.filter = options.filter;
    }
    this._send(publishMessage);

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

      // Only include reconnect flag when true (reconnecting after disconnect)
      // Absence of reconnect flag = fresh connect (no subscription restoration)
      const authMessage: { type: string; token: string; reconnect?: boolean; projectId?: string } = {
        type: "auth",
        token: this._options.token,
      };
      if (this._isReconnecting) {
        authMessage.reconnect = true;
      }
      // Include projectId for debug logging (pre-auth events)
      if (this._options.projectId) {
        authMessage.projectId = this._options.projectId;
      }
      this._send(authMessage);
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

      case "lobbyPresence":
        this._handleLobbyPresenceEvent(message);
        break;

      case "lobbySubscribed":
        this._handleLobbySubscribed(message);
        break;

      case "lobbyUnsubscribed":
        this._log("Unsubscribed from lobby:", message.lobbyId);
        break;

      case "lobbyPresenceList":
        this._handleLobbyPresenceList(message);
        break;

      case "subscribed":
        this._log("Subscribed to:", message.topic);
        break;

      case "unsubscribed":
        this._log("Unsubscribed from:", message.topic);
        this._topicFilters.delete(message.topic);
        break;

      case "filtersUpdated":
        this._log("Filters updated for:", message.topic, message.filters);
        break;

      case "replayStart":
        this._handleReplayStart(message);
        break;

      case "replayEnd":
        this._handleReplayEnd(message);
        break;

      case "error":
        this._log("Server error:", message.error);
        this._emitEvent("error", new Error(message.error));
        break;

      default:
        this._log("Unknown message type:", message.type);
    }
  }

  private _handleTopicMessage(message: { topic: string; data: unknown; isReplay?: boolean; msgId?: string; requiresAck?: boolean; filter?: string }): void {
    const { topic, data, isReplay, msgId, requiresAck, filter } = message;
    const meta: MessageMeta = {
      isReplay: isReplay ?? this._isReplaying,
      msgId,
    };
    if (filter) {
      meta.filter = filter;
    }

    // Track replay progress
    if (this._replayInfo && meta.isReplay) {
      this._replayInfo.received++;
    }

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

    // Queue ACK if required
    if (requiresAck && msgId) {
      this._queueAck(msgId);
    }
  }

  private _handleReplayStart(message: { count: number; oldestTimestamp?: string; newestTimestamp?: string }): void {
    this._isReplaying = true;
    this._replayInfo = { count: message.count, received: 0 };
    this._log("Replay starting:", message.count, "messages");

    this._emitEvent("replay:start", {
      count: message.count,
      oldestTimestamp: message.oldestTimestamp,
      newestTimestamp: message.newestTimestamp,
    });
  }

  private _handleReplayEnd(message: { replayed: number }): void {
    this._isReplaying = false;
    this._log("Replay complete:", message.replayed, "messages");

    this._emitEvent("replay:end", {
      replayed: message.replayed,
    });

    this._replayInfo = null;
  }

  private _queueAck(msgId: string): void {
    this._pendingAcks.push(msgId);

    // Send immediately if no batching, otherwise debounce
    if (this._ackBatchInterval === 0) {
      this._flushAcks();
    } else if (!this._ackTimer) {
      this._ackTimer = setTimeout(() => {
        this._flushAcks();
      }, this._ackBatchInterval);
    }
  }

  private _flushAcks(): void {
    if (this._pendingAcks.length === 0) return;

    if (this._pendingAcks.length === 1) {
      // Single ACK
      this._send({ type: "ack", msgId: this._pendingAcks[0] });
    } else {
      // Batch ACK
      this._send({ type: "batchAck", msgIds: this._pendingAcks });
    }

    this._pendingAcks = [];
    this._ackTimer = null;
  }

  private _handlePresenceEvent(message: { event: string; data: ActorPresence | { actor_token_id: string; presence: PresenceData; joined_at?: number } }): void {
    const { event, data: rawData } = message;

    if (!rawData) return;

    // Normalize snake_case to camelCase (Kraken sends snake_case)
    const data: ActorPresence = {
      actorTokenId: (rawData as any).actorTokenId || (rawData as any).actor_token_id,
      presence: rawData.presence,
      joinedAt: (rawData as any).joinedAt || (rawData as any).joined_at,
    };

    if (!data.actorTokenId) {
      return;
    }

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

  private _handlePresenceList(message: { data: ActorPresence[]; roomId?: string }): void {
    // Update local presence map
    this._presenceMap.clear();
    for (const actor of message.data || []) {
      if (actor.actorTokenId) {
        this._presenceMap.set(actor.actorTokenId, actor);
      }
    }

    // Emit for fetchPresence() promise (with optional roomId for room-scoped presence)
    this._emitEvent("presenceList", message.data, message.roomId);
  }

  private _handleLobbyPresenceEvent(message: {
    event: string;
    lobbyId: string;
    roomId: string;
    actorId: string;
    data: PresenceData;
  }): void {
    const { event, lobbyId, roomId, actorId, data } = message;

    const presenceEvent: LobbyPresenceEvent = {
      lobbyId,
      roomId,
      actorId,
      data,
    };

    // Emit lobby-specific event (e.g., "lobby:active-trips:presence:join")
    const eventKey = `lobby:${lobbyId}:presence:${event}`;
    this._emitEvent(eventKey, presenceEvent);

    // Also emit generic lobby presence event
    this._emitEvent(`lobbyPresence:${event}`, presenceEvent);
  }

  private _handleLobbySubscribed(message: {
    lobbyId: string;
    presence: LobbyPresenceState;
  }): void {
    this._log("Subscribed to lobby:", message.lobbyId);
    // Emit for lobby.subscribe() promise
    this._emitEvent(`lobbySubscribed:${message.lobbyId}`, message.presence);
  }

  private _handleLobbyPresenceList(message: {
    lobbyId: string;
    presence: LobbyPresenceState;
  }): void {
    // Emit for lobby.fetchPresence() promise
    this._emitEvent(`lobbyPresenceList:${message.lobbyId}`, message.presence);
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
      // Set flag so server knows to restore subscriptions
      this._isReconnecting = true;
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

  // Room-level filter methods

  setFilters(topic: string, filters: string[], callback?: AckCallback): void {
    this._client.setFilters(this._fullTopic(topic), filters, callback);
  }

  addFilters(topic: string, filters: string[], callback?: AckCallback): void {
    this._client.addFilters(this._fullTopic(topic), filters, callback);
  }

  removeFilters(topic: string, filters: string[], callback?: AckCallback): void {
    this._client.removeFilters(this._fullTopic(topic), filters, callback);
  }

  // Room-level presence methods

  /**
   * Set presence in this room (auto-propagates to lobbies containing this room)
   */
  setPresence(data: PresenceData, callback?: AckCallback): void {
    if (!this._client.connected) {
      callback?.(new Error("Not connected"));
      return;
    }

    // Send presence with roomId for room-scoped presence
    (this._client as any)._send({
      type: "presence",
      roomId: this._room,
      data,
    });
    callback?.(null);
  }

  /**
   * Get local cache of presence for this room
   */
  getPresence(): Record<string, ActorPresence> {
    // Return presence map as object keyed by actorTokenId
    const presenceMap = (this._client as any)._presenceMap as Map<string, ActorPresence>;
    const result: Record<string, ActorPresence> = {};
    presenceMap.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Fetch presence for this room from server
   */
  fetchPresence(): Promise<ActorPresence[]> {
    return new Promise((resolve, reject) => {
      if (!this._client.connected) {
        reject(new Error("Not connected"));
        return;
      }

      // Set up one-time handler for presence list response
      const handler = (presenceList: ActorPresence[], roomId?: string) => {
        if (roomId === this._room || !roomId) {
          this._client.off("presenceList", handler as EventHandler);
          resolve(presenceList);
        }
      };
      this._client.on("presenceList" as any, handler as any);

      (this._client as any)._send({ type: "getPresence", roomId: this._room });

      // Timeout after 5 seconds
      setTimeout(() => {
        this._client.off("presenceList", handler as EventHandler);
        reject(new Error("Presence request timeout"));
      }, 5000);
    });
  }
}

/**
 * Lobby - Scoped context for observing presence across rooms in a lobby
 *
 * Lobbies are read-only - you can only observe presence, not publish to them.
 */
class Lobby implements LobbyContext {
  constructor(
    private _client: NoLag,
    private _lobbyId: string
  ) {}

  get lobbyId(): string {
    return this._lobbyId;
  }

  /**
   * Subscribe to this lobby's presence events.
   * Returns a snapshot of current presence when subscription completes.
   */
  subscribe(callback?: AckCallback): Promise<LobbyPresenceState> {
    return new Promise((resolve, reject) => {
      if (!this._client.connected) {
        const err = new Error("Not connected");
        callback?.(err);
        reject(err);
        return;
      }

      // Set up one-time handler for lobby subscribed response
      const handler = (presence: LobbyPresenceState) => {
        this._client.off(`lobbySubscribed:${this._lobbyId}`, handler as EventHandler);
        callback?.(null);
        resolve(presence);
      };
      this._client.on(`lobbySubscribed:${this._lobbyId}` as any, handler as any);

      (this._client as any)._send({
        type: "lobbySubscribe",
        lobbyId: this._lobbyId,
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        this._client.off(`lobbySubscribed:${this._lobbyId}`, handler as EventHandler);
        const err = new Error("Lobby subscription timeout");
        callback?.(err);
        reject(err);
      }, 10000);
    });
  }

  /**
   * Unsubscribe from this lobby's presence events
   */
  unsubscribe(callback?: AckCallback): void {
    if (!this._client.connected) {
      callback?.(new Error("Not connected"));
      return;
    }

    (this._client as any)._send({
      type: "lobbyUnsubscribe",
      lobbyId: this._lobbyId,
    });
    callback?.(null);
  }

  /**
   * Fetch current presence state for the lobby
   */
  fetchPresence(): Promise<LobbyPresenceState> {
    return new Promise((resolve, reject) => {
      if (!this._client.connected) {
        reject(new Error("Not connected"));
        return;
      }

      // Set up one-time handler for lobby presence list response
      const handler = (presence: LobbyPresenceState) => {
        this._client.off(`lobbyPresenceList:${this._lobbyId}`, handler as EventHandler);
        resolve(presence);
      };
      this._client.on(`lobbyPresenceList:${this._lobbyId}` as any, handler as any);

      (this._client as any)._send({
        type: "getLobbyPresence",
        lobbyId: this._lobbyId,
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        this._client.off(`lobbyPresenceList:${this._lobbyId}`, handler as EventHandler);
        reject(new Error("Lobby presence request timeout"));
      }, 10000);
    });
  }

  /**
   * Listen for presence events in this lobby (includes room context)
   */
  on(event: "presence:join", handler: LobbyPresenceHandler): this;
  on(event: "presence:leave", handler: LobbyPresenceHandler): this;
  on(event: "presence:update", handler: LobbyPresenceHandler): this;
  on(event: string, handler: LobbyPresenceHandler): this {
    // Map event names to internal event keys
    const eventType = event.replace("presence:", "");
    const eventKey = `lobby:${this._lobbyId}:presence:${eventType}`;
    this._client.on(eventKey, handler as EventHandler);
    return this;
  }

  /**
   * Remove presence event handler
   */
  off(event: string, handler?: LobbyPresenceHandler): this {
    const eventType = event.replace("presence:", "");
    const eventKey = `lobby:${this._lobbyId}:presence:${eventType}`;
    this._client.off(eventKey, handler as EventHandler);
    return this;
  }
}

/**
 * App - Intermediate context for setting the room or lobby
 */
class App implements AppContext {
  constructor(
    private _client: NoLag,
    private _app: string
  ) {}

  setRoom(room: string): RoomContext {
    return new Room(this._client, this._app, room);
  }

  setLobby(lobby: string): LobbyContext {
    return new Lobby(this._client, lobby);
  }
}

// Legacy alias
export { NoLag as NoLagSocket };
