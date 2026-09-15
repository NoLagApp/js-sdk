/**
 * NoLag SDK
 * Real-time messaging for Node.js
 */
import { NoLag as NoLagClient } from "./client";
import type { NoLagOptions, TokenProvider } from "./types";
export { NoLagEncodeError, NoLagServerError } from "./errors";
export { NoLagSocket } from "./client";
export type { QoS, NoLagOptions, TokenProvider, ConnectionStatus, ActorType, Permission, PresenceData, ActorPresence, LobbyPresenceEvent, LobbyPresenceState, NoLagEventType, MessageMeta, ReplayStartEvent, ReplayEndEvent, ReplayStartHandler, ReplayEndHandler, HydrationEvent, HydrationHandler, SubscribeOptions, EmitOptions, RestoredSubscription, ConnectHandler, DisconnectHandler, ReconnectHandler, ErrorHandler, PresenceHandler, LobbyPresenceHandler, MessageHandler, AckCallback, AppContext, RoomContext, LobbyContext, } from "./types";
export type { WebSocketFactory, IUnifiedWebSocket } from "./websocket/types";
export type { AppLifecycleState, LifecycleAdapter, NetworkAdapter, } from "./adapters";
export { createDocumentLifecycleAdapter, createWindowNetworkAdapter, } from "./adapters";
export { NoLagApi, NoLagApiError } from "./api";
export * from "./api-types";
export { WebRTCManager } from "./webrtc";
export type { WebRTCOptions, WebRTCEvent, WebRTCEvents } from "./webrtc";
/**
 * Create a NoLag client for Node.js
 *
 * Pass an access token string, or a TokenProvider function that returns a
 * short-lived client token (JWT) minted by your backend.
 */
export declare const NoLag: (token: string | TokenProvider, options?: NoLagOptions) => NoLagClient;
export default NoLag;
