/**
 * NoLag SDK
 * Real-time messaging for Browser and React Native
 */

import { NoLag as NoLagClient } from "./client";
import { createWebSocket } from "./websocket/browser";
import type { NoLagOptions } from "./types";

export { NoLagSocket } from "./client";

// Explicitly re-export all types for better compatibility with NodeNext resolution
export type {
  QoS,
  NoLagOptions,
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

// Export REST API client
export { NoLagApi, NoLagApiError } from "./api";
export * from "./api-types";

// Export WebRTC module
export { WebRTCManager } from "./webrtc";
export type { WebRTCOptions, WebRTCEvent, WebRTCEvents } from "./webrtc";

/**
 * Create a NoLag client for Browser/React Native
 */
export const NoLag = (token: string, options?: NoLagOptions): NoLagClient => {
  return new NoLagClient(createWebSocket, token, options);
};

// Re-export the factory as default
export default NoLag;
