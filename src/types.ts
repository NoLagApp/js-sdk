/**
 * NoLag SDK v2 Types
 */

// Connection options
export interface NoLagOptions {
  /** WebSocket URL (default: wss://broker.nolag.app) */
  url?: string;
  /** Auto-reconnect on disconnect (default: true) */
  reconnect?: boolean;
  /** Reconnect interval in ms (default: 5000) */
  reconnectInterval?: number;
  /** Disconnect when browser tab is hidden (default: false) */
  disconnectOnHidden?: boolean;
  /** Enable debug logging (default: false) */
  debug?: boolean;
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
  actorType: ActorType;
  presence: PresenceData;
  joinedAt?: number;
}

// Event types
export type NoLagEventType =
  | "connect"
  | "disconnect"
  | "reconnect"
  | "error"
  | "presence:join"
  | "presence:leave"
  | "presence:update";

// Message metadata
export interface MessageMeta {
  from?: string;      // sender actorTokenId
  timestamp?: number; // server timestamp
}

// Emit options
export interface EmitOptions {
  /** Don't receive your own message back (default: false) */
  noEcho?: boolean;
}

// Event handlers
export type ConnectHandler = () => void;
export type DisconnectHandler = (reason: string) => void;
export type ReconnectHandler = () => void;
export type ErrorHandler = (error: Error) => void;
export type PresenceHandler = (actor: ActorPresence) => void;
export type MessageHandler = (data: unknown, meta: MessageMeta) => void;
export type AckCallback = (error?: Error) => void;

// Internal transport commands (byte values matching Kraken)
export enum TransportCommand {
  InitConnection = 1,
  Acknowledge = 6,
  Alert = 7,
  Identifiers = 11,
  AddAction = 12,
  Presence = 14,
  Authenticate = 15,
  DeleteAction = 16,
  Error = 21,
  Reconnect = 22,
  Server = 24,
  Topic = 26,
  Payload = 29,
}

// Separator bytes
export const IDENTIFIER_SEPARATOR = 31;
export const PAYLOAD_SEPARATOR = 29;
