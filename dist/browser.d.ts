/**
 * NoLag SDK
 * Real-time messaging for Browser and React Native
 */
import { NoLag as NoLagClient } from "./client";
import type { NoLagOptions } from "./types";
export { NoLagSocket } from "./client";
export type { QoS, NoLagOptions, ConnectionStatus, ActorType, Permission, PresenceData, ActorPresence, LobbyPresenceEvent, LobbyPresenceState, NoLagEventType, MessageMeta, ReplayStartEvent, ReplayEndEvent, ReplayStartHandler, ReplayEndHandler, SubscribeOptions, EmitOptions, RestoredSubscription, ConnectHandler, DisconnectHandler, ReconnectHandler, ErrorHandler, PresenceHandler, LobbyPresenceHandler, MessageHandler, AckCallback, AppContext, RoomContext, LobbyContext, } from "./types";
export type { WebSocketFactory, IUnifiedWebSocket } from "./websocket/types";
export { NoLagApi, NoLagApiError } from "./api";
export * from "./api-types";
export { WebRTCManager } from "./webrtc";
export type { WebRTCOptions, WebRTCEvent, WebRTCEvents } from "./webrtc";
/**
 * Create a NoLag client for Browser/React Native
 */
export declare const NoLag: (token: string, options?: NoLagOptions) => NoLagClient;
export default NoLag;
