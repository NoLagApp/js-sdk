/**
 * NoLag SDK
 * Real-time messaging for Node.js
 */

import { NoLag as NoLagClient } from "./client";
import { createWebSocket } from "./websocket/node";
import type { NoLagOptions, TokenProvider } from "./types";

export { NoLagEncodeError, NoLagServerError } from "./errors";
export { NoLagSocket } from "./client";

// Explicitly re-export all types for better compatibility with NodeNext resolution
export type {
  QoS,
  NoLagOptions,
  TokenProvider,
  ConnectionStatus,
  ActorType,
  Permission,
  PresenceData,
  ActorPresence,
  LobbyPresenceEvent,
  LobbyPresenceState,
  NoLagEventType,
  MessageMeta,
  ReplayStartEvent,
  ReplayEndEvent,
  ReplayStartHandler,
  ReplayEndHandler,
  SubscribeOptions,
  EmitOptions,
  RestoredSubscription,
  ConnectHandler,
  DisconnectHandler,
  ReconnectHandler,
  ErrorHandler,
  PresenceHandler,
  LobbyPresenceHandler,
  MessageHandler,
  AckCallback,
  AppContext,
  RoomContext,
  LobbyContext,
} from "./types";

export type { WebSocketFactory, IUnifiedWebSocket } from "./websocket/types";

// Platform adapters (app lifecycle / network reachability)
export type {
  AppLifecycleState,
  LifecycleAdapter,
  NetworkAdapter,
} from "./adapters";
export {
  createDocumentLifecycleAdapter,
  createWindowNetworkAdapter,
} from "./adapters";

// Export REST API client
export { NoLagApi, NoLagApiError } from "./api";
export * from "./api-types";

// Export WebRTC module
export { WebRTCManager } from "./webrtc";
export type { WebRTCOptions, WebRTCEvent, WebRTCEvents } from "./webrtc";

/**
 * Create a NoLag client for Node.js
 *
 * Pass an access token string, or a TokenProvider function that returns a
 * short-lived client token (JWT) minted by your backend.
 */
export const NoLag = (token: string | TokenProvider, options?: NoLagOptions): NoLagClient => {
  return new NoLagClient(createWebSocket, token, options);
};

// Re-export the factory as default
export default NoLag;
