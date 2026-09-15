/**
 * NoLag Client
 * WebSocket client for Kraken Proxy with automatic reconnection
 *
 * Subscriptions are persisted server-side - no local tracking needed.
 * On reconnect, the server automatically restores all subscriptions.
 */
import { NoLagOptions, ConnectionStatus, ActorType, PresenceData, ActorPresence, MessageMeta, EmitOptions, SubscribeOptions, ConnectHandler, DisconnectHandler, ReconnectHandler, ErrorHandler, PresenceHandler, LobbyPresenceHandler, MessageHandler, AckCallback, AppContext, ReplayStartHandler, ReplayEndHandler, HydrationHandler, TokenProvider } from "./types";
import { WebSocketFactory } from "./websocket/types";
type EventHandler = ConnectHandler | DisconnectHandler | ReconnectHandler | ErrorHandler | PresenceHandler | LobbyPresenceHandler | MessageHandler | ReplayStartHandler | ReplayEndHandler | HydrationHandler;
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
    private _tokenOrProvider;
    private _tokenRefreshTimer;
    private _pendingTokenRefresh;
    private _actorTokenId;
    private _projectId;
    private _actorType;
    private _protocolVersion;
    private _pendingSubscribes;
    private _pendingPublishes;
    private _msgRefCounter;
    private _presence;
    private _presenceMap;
    private _isReplaying;
    private _replayInfo;
    private _pendingAcks;
    private _ackTimer;
    private _ackBatchInterval;
    private _topicFilters;
    private _reconnectConfigured;
    private _lifecycleUnsub;
    private _networkUnsub;
    private _eventHandlers;
    constructor(createWebSocket: WebSocketFactory, token: string | TokenProvider, options?: NoLagOptions);
    /**
     * Wire app foreground/background transitions.
     *
     * Two things hang off this. `disconnectOnHidden` drops the socket while
     * backgrounded, and every resume rechecks token freshness: JS timers are
     * throttled or skipped outright while an app is suspended, so the scheduled
     * refresh may never have fired and the held token can already be expired.
     *
     * Pass `lifecycle: null` to opt out entirely.
     */
    private _setupLifecycleAdapter;
    /**
     * Wire network reachability.
     *
     * Reconnect backoff grows to 30s, which is the wrong behaviour on a device
     * that just moved from a dead cell to wifi. A reachability signal collapses
     * the backoff and retries immediately.
     *
     * Pass `network: null` to opt out entirely.
     */
    private _setupNetworkAdapter;
    /**
     * Re-evaluate the held client token after a period where timers may not have
     * run. Refreshes immediately if it is expired or close to it, otherwise
     * re-arms the scheduled refresh.
     */
    private _revalidateToken;
    /**
     * Release everything this client owns: the socket, its timers, and the
     * lifecycle/network subscriptions.
     *
     * `disconnect()` deliberately leaves the adapter subscriptions in place so a
     * backgrounded client can come back. Call `destroy()` when the client itself
     * is going away (React unmount, for instance) to avoid leaking listeners.
     * Registered event handlers are left alone.
     */
    destroy(): void;
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
    /** Negotiated protocol version (1 against pre-v2 brokers). */
    get protocolVersion(): number;
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
    private _settleSubscribe;
    private _settlePublish;
    private _failAllPending;
    /**
     * Unsubscribe from a topic
     *
     * This also removes the subscription from server-side persistence.
     */
    unsubscribe(topic: string, callback?: AckCallback): void;
    /**
     * Replace all filters for a topic.
     * Sends a setFilters message to the server which handles subscribe/unsubscribe diffs.
     * Empty array switches back to wildcard (receive all messages).
     */
    setFilters(topic: string, filters: (string | string[])[], callback?: AckCallback): void;
    /**
     * Add filters to the existing set for a topic.
     * Merges with current filters and sends the full set to the server.
     */
    addFilters(topic: string, filters: string[], callback?: AckCallback): void;
    /**
     * Remove specific filters from a topic.
     * Removes from current set and sends the remaining filters to the server.
     */
    removeFilters(topic: string, filters: string[], callback?: AckCallback): void;
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
    on(event: "replay:start", handler: ReplayStartHandler): this;
    on(event: "replay:end", handler: ReplayEndHandler): this;
    on(event: "hydration", handler: HydrationHandler): this;
    on<T = unknown>(event: string, handler: MessageHandler<T>): this;
    /**
     * Remove event handler
     */
    off(event: string, handler?: EventHandler): this;
    /**
     * Listen to all topic messages
     */
    onAny<T = unknown>(handler: (topic: string, data: T, meta: MessageMeta) => void): this;
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
    /**
     * Decode the exp claim (unix seconds) from a JWT without verifying it.
     * Returns null for opaque tokens or anything that does not parse.
     */
    private _decodeJwtExp;
    /**
     * Schedule a proactive refresh-reconnect shortly before a client token
     * (JWT) expires. Only armed when a token provider is available to mint
     * a fresh token; static-string JWTs simply expire (4003).
     */
    private _scheduleTokenRefresh;
    /**
     * Renew the client token. Preferred path: in-band `reauth` over the live
     * connection (nothing drops, no resubscribe). Fallback (older brokers or
     * transient failures): the reconnect flow, where the provider mints a
     * fresh token and the server restores subscriptions.
     */
    private _refreshToken;
    private _refreshViaReconnect;
    /** Send a reauth frame and resolve with the broker's verdict.
     *  Resolves false on failure, timeout, or brokers without reauth support
     *  (they ignore the unknown frame and the timeout fires). */
    private _sendReauth;
    private _clearTokenRefresh;
    private _sendPresence;
    private _send;
    /** Fire-and-forget internal sends (acks, presence, heartbeats): never throw,
     *  but encode failures are still surfaced on the 'error' event by _send. */
    private _trySend;
    private _handleMessage;
    private _handleTopicMessage;
    private _handleReplayStart;
    /**
     * The broker forwards the hydration webhook's response body once per
     * subscribe. Surfaced as its own event rather than through the topic
     * handlers so a consumer can tell "state on join" from live traffic.
     */
    private _handleHydration;
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
