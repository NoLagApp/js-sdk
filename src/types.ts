/**
 * NoLag SDK Types
 */

// QoS levels for MQTT
export type QoS = 0 | 1 | 2;

// Connection options (all optional - token is passed separately)
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
   * Project ID for debug logging.
   * When provided, connection attempts and rejections will be logged
   * with this project ID, making them visible in the Event Logs dashboard.
   * This is only used for logging purposes and does not affect authorization.
   */
  projectId?: string;
}

// Connection status
export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

// Actor types
export type ActorType = "device" | "user" | "server";

// Permission types
export type Permission = "subscribe" | "publish" | "pubSub";

// Presence data (user-defined)
export type PresenceData = Record<string, unknown>;

// Actor presence info
export interface ActorPresence {
  actorTokenId: string;
  actorType?: ActorType;
  presence: PresenceData;
  joinedAt?: number;
}

// Lobby presence event (includes room context)
export interface LobbyPresenceEvent {
  lobbyId: string;
  roomId: string;
  actorId: string;
  data: PresenceData;
}

// Lobby presence state (keyed by roomId -> actorId -> presence)
export type LobbyPresenceState = Record<string, Record<string, PresenceData>>;

// Event types
export type NoLagEventType =
  | "connect"
  | "disconnect"
  | "reconnect"
  | "error"
  | "presence:join"
  | "presence:leave"
  | "presence:update"
  | "replay:start"
  | "replay:end";

// Message metadata
export interface MessageMeta {
  from?: string;      // sender actorTokenId
  timestamp?: number; // server timestamp
  /** Whether this message is being replayed (from history) */
  isReplay?: boolean;
  /** Unique message ID (for ACK) */
  msgId?: string;
}

// Replay start event data
export interface ReplayStartEvent {
  count: number;
  oldestTimestamp?: string;
  newestTimestamp?: string;
}

// Replay end event data
export interface ReplayEndEvent {
  replayed: number;
}

// Replay event handlers
export type ReplayStartHandler = (event: ReplayStartEvent) => void;
export type ReplayEndHandler = (event: ReplayEndEvent) => void;

// Subscribe options
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
}

// Emit options
export interface EmitOptions {
  /** QoS level for this message */
  qos?: QoS;
  /** Retain message on broker (default: false) */
  retain?: boolean;
  /**
   * Whether to receive this message back if subscribed to the same topic.
   * (default: true - you will receive your own messages)
   */
  echo?: boolean;
}

// Restored subscription info (received from server on reconnect)
export interface RestoredSubscription {
  /** Topic name */
  name: string;
  /** Whether this subscription uses load balancing */
  loadBalance?: boolean;
  /** Load balance group name */
  loadBalanceGroup?: string;
}

// Event handlers
export type ConnectHandler = () => void;
export type DisconnectHandler = (reason: string) => void;
export type ReconnectHandler = () => void;
export type ErrorHandler = (error: Error) => void;
export type PresenceHandler = (actor: ActorPresence) => void;
export type LobbyPresenceHandler = (event: LobbyPresenceEvent) => void;
export type MessageHandler = (data: unknown, meta: MessageMeta) => void;
export type AckCallback = (error: Error | null) => void;

// App context for fluent API
export interface AppContext {
  /** Set the room within this app */
  setRoom(room: string): RoomContext;

  /** Set the lobby within this app (for presence observation) */
  setLobby(lobby: string): LobbyContext;
}

// Room context for fluent API
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
  on(topic: string, handler: MessageHandler): RoomContext;

  /** Remove message handler for a topic in this room */
  off(topic: string, handler?: MessageHandler): RoomContext;

  /** Set presence in this room (auto-propagates to lobbies) */
  setPresence(data: PresenceData, callback?: AckCallback): void;

  /** Get presence for this room */
  getPresence(): Record<string, ActorPresence>;

  /** Fetch presence for this room from server */
  fetchPresence(): Promise<ActorPresence[]>;
}

// Lobby context for fluent API (presence observation only)
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
