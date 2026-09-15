/**
 * NoLag SDK Types
 */
import type { LifecycleAdapter, NetworkAdapter } from "./adapters";
import type { NoLagEncodeError, NoLagServerError } from "./errors";
export type QoS = 0 | 1 | 2;
/**
 * Async token provider for client tokens (short-lived JWTs minted by your
 * backend). Called on every connect and reconnect, so each attempt uses a
 * freshly minted token. When the resolved token is a JWT with an exp claim,
 * the SDK proactively reconnects shortly before expiry (the server restores
 * subscriptions on reconnect).
 */
export type TokenProvider = () => string | Promise<string>;
export interface NoLagOptions {
    /** Actor token ID (used as MQTT username) */
    actorTokenId?: string;
    /** WebSocket URL (default: wss://broker.nolag.app/ws) */
    url?: string;
    /** Auto-reconnect on disconnect (default: true) */
    reconnect?: boolean;
    /** Reconnect interval in ms (default: 5000) */
    reconnectInterval?: number;
    /** Disconnect when browser tab is hidden (default: false) */
    disconnectOnHidden?: boolean;
    /** Enable debug logging (default: false) */
    debug?: boolean;
    /** Default QoS level (default: 1) */
    qos?: QoS;
    /** Heartbeat interval in ms (default: 30000, 0 to disable) */
    heartbeatInterval?: number;
    /**
     * Enable load balancing for all subscriptions.
     * When true, messages are round-robin distributed across all clients
     * with the same loadBalanceGroup (or actorTokenId if not specified).
     * Only ONE client receives each message, not all of them.
     * Useful for worker queues and distributed processing.
     * (default: false)
     */
    loadBalance?: boolean;
    /**
     * Load balance group name.
     * Clients in the same group share messages when loadBalance is true.
     * If not specified, uses the actor token ID as the group.
     */
    loadBalanceGroup?: string;
    /**
     * ACK batch interval in milliseconds.
     * When > 0, ACKs are batched and sent together after this delay.
     * Set to 0 for immediate ACKs (lowest latency).
     * (default: 0)
     */
    ackBatchInterval?: number;
    /**
     * Names this client instance, for actors whose sessions persist
     * (`agent` and `orchestrator` types).
     *
     * A broker session belongs to a client instance, not to a credential. Two
     * processes sharing an actor token are, without this, two attempts at the
     * same session: only the first keeps a resumable one and the rest get clean
     * sessions. Give each worker its own stable id and they each keep their own
     * session, so a worker that goes away still finds its queued messages when
     * it returns.
     *
     * It must be STABLE for a given worker across restarts — that is what makes
     * a reconnect "the same worker coming back" rather than a new one. A value
     * derived from a pod name or a configured worker id is right; a random value
     * per process is not, because the old session then lingers holding messages
     * nobody will collect.
     *
     * Letters, digits, `-` and `_` only; anything else is stripped and the
     * result is capped at 64 characters. Ignored for actor types whose sessions
     * do not persist.
     */
    clientId?: string;
    /**
     * Project ID for debug logging.
     * When provided, connection attempts and rejections will be logged
     * with this project ID, making them visible in the Event Logs dashboard.
     * This is only used for logging purposes and does not affect authorization.
     */
    projectId?: string;
    /**
     * App foreground/background adapter.
     *
     * Defaults to the Page Visibility API where `document` exists. React Native
     * has no `document`, so pass an AppState-backed adapter (or use
     * `@nolag/react-native`, which wires one up for you). Pass `null` to opt out.
     */
    lifecycle?: LifecycleAdapter | null;
    /**
     * Network reachability adapter, used to collapse reconnect backoff the
     * moment connectivity returns.
     *
     * Defaults to `window` online/offline events where `window` exists. On React
     * Native, pass a NetInfo-backed adapter. Pass `null` to opt out.
     */
    network?: NetworkAdapter | null;
}
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";
export type ActorType = "device" | "user" | "service" | "session" | "agent" | "orchestrator" | "observer";
export type Permission = "subscribe" | "publish" | "pubSub";
export type PresenceStatus = "online" | "offline" | "waking";
export interface WakeConfig {
    url: string;
    timeoutMs?: number;
    enabled?: boolean;
}
export type PresenceData = Record<string, unknown> & {
    persistent?: boolean;
    wake?: WakeConfig;
};
export interface ActorPresence {
    actorTokenId: string;
    actorType?: ActorType;
    presence: PresenceData;
    joinedAt?: number;
    status?: PresenceStatus;
    advertisementVersion?: number;
}
export interface LobbyPresenceEvent {
    lobbyId: string;
    roomId: string;
    actorId: string;
    data: PresenceData;
}
export type LobbyPresenceState = Record<string, Record<string, PresenceData>>;
export type NoLagEventType = "connect" | "disconnect" | "reconnect" | "error" | "presence:join" | "presence:leave" | "presence:update" | "replay:start" | "replay:end" | "hydration";
export interface MessageMeta {
    from?: string;
    timestamp?: number;
    /** Whether this message is being replayed (from history) */
    isReplay?: boolean;
    /** Unique message ID (for ACK) */
    msgId?: string;
    /** Filter value this message was published with (if any) */
    filter?: string;
}
export interface ReplayStartEvent {
    count: number;
    oldestTimestamp?: string;
    newestTimestamp?: string;
}
export interface ReplayEndEvent {
    replayed: number;
}
export type ReplayStartHandler = (event: ReplayStartEvent) => void;
export type ReplayEndHandler = (event: ReplayEndEvent) => void;
/**
 * Delivered once per subscribe when the app has a hydration webhook: the
 * broker calls the webhook and forwards its JSON body here. `topic` is the
 * bare topic name (for example `messages`), not the room-qualified pattern.
 */
export interface HydrationEvent {
    topic: string;
    data: unknown;
}
export type HydrationHandler = (event: HydrationEvent) => void;
export interface SubscribeOptions {
    /** QoS level for this subscription */
    qos?: QoS;
    /**
     * Override load balancing for this specific subscription.
     * If not specified, uses the connection-level loadBalance setting.
     */
    loadBalance?: boolean;
    /**
     * Override load balance group for this specific subscription.
     * If not specified, uses the connection-level loadBalanceGroup setting.
     */
    loadBalanceGroup?: string;
    /**
     * Filter values for this subscription.
     * Each filter maps to a sub-topic in MQTT, so only messages published
     * with a matching filter are delivered.
     * Without filters, subscribes to all messages on the topic (wildcard).
     * Max 100 filters per topic. Values must not contain '/', '#', '+', or '|'.
     *
     * Supports AND logic via nested arrays:
     * - `['alice', 'bob']` → OR: matches alice OR bob
     * - `[['alice', 'admin']]` → AND: matches messages tagged with both alice AND admin
     * - `[['alice', 'admin'], 'bob']` → (alice AND admin) OR bob
     */
    filters?: (string | string[])[];
}
export interface EmitOptions {
    /** QoS level for this message */
    qos?: QoS;
    /** Retain message on broker (default: false) */
    retain?: boolean;
    /**
     * Per-connection echo flag passed to the broker (default: true). Note that
     * the publishing ACTOR never receives its own message regardless of this
     * flag: the broker drops it before delivery. Setting it to false only adds a
     * per-connection drop for the rare case of two connections on one actor.
     */
    echo?: boolean;
    /**
     * Filter value for this publish.
     * Routes the message to subscribers whose filter list includes this value.
     * Subscribers with NO filters are wildcard subscribers and also receive it;
     * filters are routing, not a privacy boundary.
     * Must not contain '/', '#', '+', or '|'.
     */
    filter?: string;
    /**
     * AND composite filter for this publish.
     * Publishes to a composite filter topic (values are sorted, lowercased, joined with '|' server-side).
     * Example: `['admin', 'alice']` publishes to the `admin|alice` composite topic.
     * `filter` takes precedence if both are provided.
     */
    filters?: string[];
}
export interface RestoredSubscription {
    /** Topic name */
    name: string;
    /** Whether this subscription uses load balancing */
    loadBalance?: boolean;
    /** Load balance group name */
    loadBalanceGroup?: string;
    /** Active filters for this subscription */
    filters?: string[];
}
export type ConnectHandler = () => void;
export type DisconnectHandler = (reason: string) => void;
export type ReconnectHandler = () => void;
/**
 * Broker-originated failures arrive as `NoLagServerError` (with `code`,
 * `hint`, `topic`); encode failures as `NoLagEncodeError`; transport
 * failures as a plain `Error`. Narrow with `instanceof`.
 */
export type ErrorHandler = (error: NoLagServerError | NoLagEncodeError | Error) => void;
export type PresenceHandler = (actor: ActorPresence) => void;
export type LobbyPresenceHandler = (event: LobbyPresenceEvent) => void;
export type MessageHandler<T = unknown> = (data: T, meta: MessageMeta) => void;
export type AckCallback = (error: Error | null) => void;
export interface AppContext {
    /** Set the room within this app */
    setRoom(room: string): RoomContext;
    /** Set the lobby within this app (for presence observation) */
    setLobby(lobby: string): LobbyContext;
}
export interface RoomContext {
    /** The full topic prefix (app/room) */
    readonly prefix: string;
    /** Subscribe to a topic in this room */
    subscribe(topic: string, callback?: AckCallback): void;
    subscribe(topic: string, options: SubscribeOptions, callback?: AckCallback): void;
    /** Unsubscribe from a topic in this room */
    unsubscribe(topic: string, callback?: AckCallback): void;
    /** Emit/publish to a topic in this room */
    emit(topic: string, data: unknown, callback?: AckCallback): void;
    emit(topic: string, data: unknown, options: EmitOptions, callback?: AckCallback): void;
    /** Listen for messages on a topic in this room */
    on<T = unknown>(topic: string, handler: MessageHandler<T>): RoomContext;
    /** Remove message handler for a topic in this room */
    off<T = unknown>(topic: string, handler?: MessageHandler<T>): RoomContext;
    /** Replace all filters for a topic in this room */
    setFilters(topic: string, filters: string[], callback?: AckCallback): void;
    /** Add filters to existing filters for a topic in this room */
    addFilters(topic: string, filters: string[], callback?: AckCallback): void;
    /** Remove specific filters from a topic in this room */
    removeFilters(topic: string, filters: string[], callback?: AckCallback): void;
    /** Set presence in this room (auto-propagates to lobbies) */
    setPresence(data: PresenceData, callback?: AckCallback): void;
    /** Get presence for this room */
    getPresence(): Record<string, ActorPresence>;
    /** Fetch presence for this room from server */
    fetchPresence(): Promise<ActorPresence[]>;
}
export interface LobbyContext {
    /** The lobby ID */
    readonly lobbyId: string;
    /**
     * Subscribe to this lobby's presence events.
     * Returns a snapshot of current presence when subscription completes.
     */
    subscribe(callback?: AckCallback): Promise<LobbyPresenceState>;
    /** Unsubscribe from this lobby's presence events */
    unsubscribe(callback?: AckCallback): void;
    /** Fetch current presence state for the lobby */
    fetchPresence(): Promise<LobbyPresenceState>;
    /** Listen for presence events in this lobby (includes room context) */
    on(event: "presence:join", handler: LobbyPresenceHandler): LobbyContext;
    on(event: "presence:leave", handler: LobbyPresenceHandler): LobbyContext;
    on(event: "presence:update", handler: LobbyPresenceHandler): LobbyContext;
    /** Remove presence event handler */
    off(event: string, handler?: LobbyPresenceHandler): LobbyContext;
}
