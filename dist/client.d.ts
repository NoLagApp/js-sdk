/**
 * NoLag Client
 * WebSocket client for Kraken Proxy with automatic reconnection
 *
 * Subscriptions are persisted server-side - no local tracking needed.
 * On reconnect, the server automatically restores all subscriptions.
 */
import { NoLagOptions, ConnectionStatus, ActorType, PresenceData, ActorPresence, MessageMeta, EmitOptions, SubscribeOptions, ConnectHandler, DisconnectHandler, ReconnectHandler, ErrorHandler, PresenceHandler, LobbyPresenceHandler, MessageHandler, AckCallback, AppContext, ReplayStartHandler, ReplayEndHandler } from "./types";
import { WebSocketFactory } from "./websocket/types";
type EventHandler = ConnectHandler | DisconnectHandler | ReconnectHandler | ErrorHandler | PresenceHandler | LobbyPresenceHandler | MessageHandler | ReplayStartHandler | ReplayEndHandler;
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
export declare class NoLag {
    private _options;
    private _createWebSocket;
    private _ws;
    private _status;
    private _reconnectAttempts;
    private _reconnectTimer;
    private _heartbeatTimer;
    private _isReconnecting;
    private _actorTokenId;
    private _projectId;
    private _actorType;
    private _presence;
    private _presenceMap;
    private _isReplaying;
    private _replayInfo;
    private _pendingAcks;
    private _ackTimer;
    private _ackBatchInterval;
    private _eventHandlers;
    constructor(createWebSocket: WebSocketFactory, token: string, options?: NoLagOptions);
    get status(): ConnectionStatus;
    get connected(): boolean;
    get actorId(): string | null;
    get actorType(): ActorType | null;
    /** Whether we're currently replaying missed messages */
    get isReplayingMessages(): boolean;
    /** Current replay progress (count and received), or null if not replaying */
    get replayProgress(): {
        count: number;
        received: number;
    } | null;
    get projectId(): string | null;
    get loadBalanced(): boolean;
    get loadBalanceGroup(): string | undefined;
    /**
     * Connect to NoLag
     *
     * On reconnect, the server automatically restores all previous subscriptions.
     */
    connect(): Promise<void>;
    /**
     * Disconnect from NoLag
     */
    disconnect(): void;
    /**
     * Set your presence (project-level)
     *
     * Note: Presence is client-side only and will be re-sent on reconnect.
     */
    setPresence(data: PresenceData, callback?: AckCallback): void;
    /**
     * Get all present actors in project (local cache)
     */
    getPresence(): ActorPresence[];
    getPresence(actorId: string): ActorPresence | undefined;
    /**
     * Request presence list from server
     */
    fetchPresence(): Promise<ActorPresence[]>;
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
    /**
     * Unsubscribe from a topic
     *
     * This also removes the subscription from server-side persistence.
     */
    unsubscribe(topic: string, callback?: AckCallback): void;
    /**
     * Acknowledge receipt of a message
     *
     * Note: ACKs are automatically sent when messages have `requiresAck: true`.
     * Use this method for manual ACK scenarios.
     */
    ack(msgId: string): void;
    /**
     * Acknowledge multiple messages at once
     */
    batchAck(msgIds: string[]): void;
    /**
     * Emit/publish to a topic
     */
    emit(topic: string, data: unknown, optionsOrCallback?: EmitOptions | AckCallback, callback?: AckCallback): void;
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
    /**
     * Remove event handler
     */
    off(event: string, handler?: EventHandler): this;
    /**
     * Listen to all topic messages
     */
    onAny(handler: (topic: string, data: unknown, meta: MessageMeta) => void): this;
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
    setApp(app: string): AppContext;
    private _authenticate;
    private _sendPresence;
    private _send;
    private _handleMessage;
    private _handleTopicMessage;
    private _handleReplayStart;
    private _handleReplayEnd;
    private _queueAck;
    private _flushAcks;
    private _handlePresenceEvent;
    private _handlePresenceList;
    private _handleLobbyPresenceEvent;
    private _handleLobbySubscribed;
    private _handleLobbyPresenceList;
    private _scheduleReconnect;
    private _emitEvent;
    private _log;
    private _startHeartbeat;
    private _stopHeartbeat;
}
export { NoLag as NoLagSocket };
