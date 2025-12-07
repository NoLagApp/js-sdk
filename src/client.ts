/**
 * NoLag Client
 * Main SDK class - Socket.IO style API with MessagePack protocol
 */

import {
  NoLagOptions,
  ConnectionStatus,
  ActorType,
  PresenceData,
  ActorPresence,
  MessageMeta,
  EmitOptions,
  ConnectHandler,
  DisconnectHandler,
  ReconnectHandler,
  ErrorHandler,
  PresenceHandler,
  MessageHandler,
  AckCallback,
} from "./types";
import { createWebSocket, UnifiedWebSocket } from "./websocket";
import {
  decode,
  createAuthMessage,
  createSubscribeMessage,
  createUnsubscribeMessage,
  createTopicMessage,
  createPresenceMessage,
  isInitMessage,
  isAckMessage,
  isErrorMessage,
  isAlertMessage,
  isTopicMessage,
  isPresenceEventMessage,
  Message,
  AckMessage,
  TopicMessage,
  PresenceEventMessage,
} from "./transport";

const DEFAULT_URL = "wss://broker.nolag.app/v2/ws";
const HEARTBEAT_INTERVAL = 20000;
const DEFAULT_RECONNECT_INTERVAL = 5000;

type EventHandler =
  | ConnectHandler
  | DisconnectHandler
  | ReconnectHandler
  | ErrorHandler
  | PresenceHandler
  | MessageHandler;

/**
 * NoLag Socket Client
 */
export class NoLagSocket {
  private _token: string;
  private _options: Required<NoLagOptions>;
  private _ws: UnifiedWebSocket | null = null;
  private _status: ConnectionStatus = "disconnected";
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Actor info (populated after connect)
  private _actorTokenId: string | null = null;
  private _projectId: string | null = null;
  private _actorType: ActorType | null = null;

  // Presence
  private _presence: PresenceData | null = null;
  private _presenceMap: Map<string, ActorPresence> = new Map();

  // Event handlers
  private _eventHandlers: Map<string, Set<EventHandler>> = new Map();

  // Subscribed topics
  private _subscriptions: Set<string> = new Set();

  // Pending ack callbacks
  private _ackCallbacks: Map<string, AckCallback> = new Map();
  private _ackCounter = 0;

  constructor(token: string, options: NoLagOptions = {}) {
    this._token = token;
    this._options = {
      url: options.url ?? DEFAULT_URL,
      reconnect: options.reconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? DEFAULT_RECONNECT_INTERVAL,
      disconnectOnHidden: options.disconnectOnHidden ?? false,
      debug: options.debug ?? false,
    };

    // Set up visibility change handler for browser
    if (typeof document !== "undefined" && this._options.disconnectOnHidden) {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          this.disconnect();
        } else if (document.visibilityState === "visible") {
          this._reconnect();
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

  get subscriptions(): string[] {
    return Array.from(this._subscriptions);
  }

  // ============ Connection ============

  /**
   * Connect to NoLag
   */
  async connect(): Promise<void> {
    if (this._status === "connected" || this._status === "connecting") {
      return;
    }

    this._status = "connecting";
    this._log("Connecting to", this._options.url);

    try {
      this._ws = await createWebSocket(this._options.url);

      this._ws.onOpen(() => {
        this._log("WebSocket opened, waiting for init...");
      });

      this._ws.onMessage((data) => {
        this._handleMessage(data);
      });

      this._ws.onClose((code, reason) => {
        this._log("WebSocket closed:", code, reason);
        this._handleDisconnect(reason || "Connection closed");
      });

      this._ws.onError((error) => {
        this._log("WebSocket error:", error);
        this._emit("error", error);
      });
    } catch (error) {
      this._status = "disconnected";
      throw error;
    }
  }

  /**
   * Disconnect from NoLag
   */
  disconnect(): void {
    this._log("Disconnecting...");
    this._stopHeartbeat();
    this._clearReconnectTimer();

    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }

    this._status = "disconnected";
    this._subscriptions.clear();
    this._presenceMap.clear();
  }

  // ============ Presence ============

  /**
   * Set your presence (project-level)
   */
  setPresence(data: PresenceData, callback?: AckCallback): void {
    this._presence = data;

    if (!this.connected || !this._ws) {
      callback?.(new Error("Not connected"));
      return;
    }

    const message = createPresenceMessage(data);
    this._ws.send(message);

    if (callback) {
      const ackId = this._generateAckId("presence");
      this._ackCallbacks.set(ackId, callback);
    }
  }

  /**
   * Get all present actors in project
   */
  getPresence(): ActorPresence[];
  getPresence(actorId: string): ActorPresence | undefined;
  getPresence(actorId?: string): ActorPresence[] | ActorPresence | undefined {
    if (actorId) {
      return this._presenceMap.get(actorId);
    }
    return Array.from(this._presenceMap.values());
  }

  // ============ Topics ============

  /**
   * Subscribe to a topic
   */
  subscribe(topic: string, callback?: AckCallback): void {
    if (!this.connected || !this._ws) {
      callback?.(new Error("Not connected"));
      return;
    }

    this._log("Subscribing to:", topic);

    const message = createSubscribeMessage(topic);
    this._ws.send(message);
    this._subscriptions.add(topic);

    if (callback) {
      const ackId = this._generateAckId(`sub:${topic}`);
      this._ackCallbacks.set(ackId, callback);
    }
  }

  /**
   * Unsubscribe from a topic
   */
  unsubscribe(topic: string, callback?: AckCallback): void {
    if (!this.connected || !this._ws) {
      callback?.(new Error("Not connected"));
      return;
    }

    this._log("Unsubscribing from:", topic);

    const message = createUnsubscribeMessage(topic);
    this._ws.send(message);
    this._subscriptions.delete(topic);

    if (callback) {
      const ackId = this._generateAckId(`unsub:${topic}`);
      this._ackCallbacks.set(ackId, callback);
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

    const message = createTopicMessage(topic, data);
    this._ws.send(message);

    if (ackCb) {
      const ackId = this._generateAckId(`emit:${topic}`);
      this._ackCallbacks.set(ackId, ackCb);
    }
  }

  // ============ Event Handlers ============

  /**
   * Register event handler
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

  // ============ Private Methods ============

  private _emit(event: string, ...args: unknown[]): void {
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

    // Also emit to wildcard handlers for topic messages
    if (!event.startsWith("presence:") && !["connect", "disconnect", "reconnect", "error"].includes(event)) {
      const anyHandlers = this._eventHandlers.get("*");
      if (anyHandlers) {
        for (const handler of anyHandlers) {
          try {
            (handler as (topic: string, ...args: unknown[]) => void)(event, ...args);
          } catch (e) {
            console.error("Error in wildcard handler:", e);
          }
        }
      }
    }
  }

  private _handleMessage(data: ArrayBuffer): void {
    // Empty message = heartbeat response
    if (data.byteLength === 0) {
      return;
    }

    let message: Message;
    try {
      message = decode(data);
    } catch (e) {
      this._log("Failed to decode message:", e);
      return;
    }

    this._log("Received:", message);

    // Handle init (server ready for auth)
    if (isInitMessage(message)) {
      this._log("Received init, sending auth...");
      this._sendAuth();
      return;
    }

    // Handle ack
    if (isAckMessage(message)) {
      this._handleAck(message);
      return;
    }

    // Handle error
    if (isErrorMessage(message)) {
      this._emit("error", new Error(message.message));
      return;
    }

    // Handle alert
    if (isAlertMessage(message)) {
      this._log("Alert:", message.message);
      return;
    }

    // Handle topic message
    if (isTopicMessage(message)) {
      this._handleTopicMessage(message);
      return;
    }

    // Handle presence event
    if (isPresenceEventMessage(message)) {
      this._handlePresenceEvent(message);
      return;
    }
  }

  private _handleAck(message: AckMessage): void {
    // Auth ack - contains actor info
    if (message.actorId && this._status === "connecting") {
      this._actorTokenId = message.actorId;
      this._projectId = message.projectId ?? null;
      this._actorType = (message.actorType as ActorType) ?? null;
      this._status = "connected";
      this._startHeartbeat();
      this._log("Connected as:", this._actorTokenId);
      this._emit("connect");
      return;
    }

    // Topic/action ack - trigger callbacks
    // TODO: Match with pending callbacks
  }

  private _handleTopicMessage(message: TopicMessage): void {
    const meta: MessageMeta = {
      from: message.meta?.from,
    };
    this._emit(message.topic, message.data, meta);
  }

  private _handlePresenceEvent(message: PresenceEventMessage): void {
    const { event, data } = message;
    const actorPresence: ActorPresence = {
      actorTokenId: data.actorTokenId,
      actorType: (data.actorType as ActorType) ?? "device",
      presence: data.presence ?? {},
    };

    switch (event) {
      case "join":
        this._presenceMap.set(data.actorTokenId, actorPresence);
        this._emit("presence:join", actorPresence);
        break;
      case "leave":
        this._presenceMap.delete(data.actorTokenId);
        this._emit("presence:leave", actorPresence);
        break;
      case "update":
        this._presenceMap.set(data.actorTokenId, actorPresence);
        this._emit("presence:update", actorPresence);
        break;
    }
  }

  private _sendAuth(): void {
    if (!this._ws) return;

    const isReconnecting = this._status === "reconnecting";
    const message = createAuthMessage(this._token, isReconnecting);
    this._ws.send(message);
  }

  private _handleDisconnect(reason: string): void {
    this._stopHeartbeat();
    this._ws = null;

    const wasConnected = this._status === "connected";
    this._status = "disconnected";

    if (wasConnected) {
      this._emit("disconnect", reason);
    }

    // Auto-reconnect if enabled
    if (this._options.reconnect && wasConnected) {
      this._scheduleReconnect();
    }
  }

  private _scheduleReconnect(): void {
    this._clearReconnectTimer();

    this._log("Scheduling reconnect in", this._options.reconnectInterval, "ms");

    this._reconnectTimer = setTimeout(() => {
      this._reconnect();
    }, this._options.reconnectInterval);
  }

  private async _reconnect(): Promise<void> {
    if (this._status === "connected" || this._status === "connecting") {
      return;
    }

    this._log("Reconnecting...");
    this._status = "reconnecting";

    try {
      await this.connect();
      this._emit("reconnect");

      // Re-subscribe to topics
      for (const topic of this._subscriptions) {
        this.subscribe(topic);
      }

      // Re-set presence
      if (this._presence) {
        this.setPresence(this._presence);
      }
    } catch (error) {
      this._log("Reconnect failed:", error);
      this._scheduleReconnect();
    }
  }

  private _clearReconnectTimer(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  private _startHeartbeat(): void {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (this._ws && this._status === "connected") {
        // Send empty message as heartbeat
        this._ws.send(new ArrayBuffer(0));
      }
    }, HEARTBEAT_INTERVAL);
  }

  private _stopHeartbeat(): void {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  private _generateAckId(prefix: string): string {
    return `${prefix}:${++this._ackCounter}`;
  }

  private _log(...args: unknown[]): void {
    if (this._options.debug) {
      console.log("[NoLag]", ...args);
    }
  }
}
