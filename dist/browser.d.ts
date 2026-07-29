/**
 * NoLag SDK
 * Real-time messaging for Browser and React Native
 */
import { NoLag as NoLagClient } from "./client";
import type { NoLagOptions, TokenProvider } from "./types";
export { NoLagSocket } from "./client";
export type { QoS, NoLagOptions, TokenProvider, ConnectionStatus, ActorType, Permission, PresenceData, ActorPresence, LobbyPresenceEvent, LobbyPresenceState, NoLagEventType, MessageMeta, ReplayStartEvent, ReplayEndEvent, ReplayStartHandler, ReplayEndHandler, SubscribeOptions, EmitOptions, RestoredSubscription, ConnectHandler, DisconnectHandler, ReconnectHandler, ErrorHandler, PresenceHandler, LobbyPresenceHandler, MessageHandler, AckCallback, AppContext, RoomContext, LobbyContext, } from "./types";
export type { WebSocketFactory, IUnifiedWebSocket } from "./websocket/types";
export { NoLagApi, NoLagApiError } from "./api";
export * from "./api-types";
export { WebRTCManager } from "./webrtc";
export type { WebRTCOptions, WebRTCEvent, WebRTCEvents } from "./webrtc";
/**
 * Create a NoLag client for Browser/React Native
 *
 * Pass an access token string, or (recommended for browsers) a TokenProvider
 * function that returns a short-lived client token (JWT) minted by your
 * backend. Never ship a long-lived actor access token to the browser.
 */
export declare const NoLag: (token: string | TokenProvider, options?: NoLagOptions) => NoLagClient;
export default NoLag;
