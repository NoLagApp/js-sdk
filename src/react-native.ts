/**
 * NoLag SDK
 * Real-time messaging for React Native.
 *
 * React Native's WebSocket is the native one and supports
 * `binaryType = "arraybuffer"`, so the transport is identical to the browser
 * build. This entry point exists for two reasons.
 *
 * 1. Metro needs a `react-native` condition to resolve. It matches
 *    "react-native" then "import"/"require", and does not understand the
 *    "browser" condition at all, so without this it resolves the Node build and
 *    tries to bundle `ws` (and with it net, tls and http).
 *
 * 2. The WebRTC module is deliberately excluded. `webrtc/environment.ts` does a
 *    bare require of the Node-only wrtc package. Metro collects dependencies
 *    statically, and `allowOptionalDependencies` defaults to false:
 *    @expo/metro-config turns it on, but bare @react-native/metro-config does
 *    not, so that require fails the bundle on bare React Native while working
 *    under Expo. Rather than ship something that breaks on half the ecosystem,
 *    WebRTC is left out. React Native needs `react-native-webrtc` regardless,
 *    which is a separate piece of work.
 *
 * The core has no other React Native specific behaviour. App lifecycle and
 * network reachability arrive through the `lifecycle` and `network` adapter
 * options; `@nolag/react-native` wires those to AppState and NetInfo for you.
 *
 * Note: `@msgpack/msgpack` constructs `TextEncoder`/`TextDecoder` at module
 * scope, so importing this on a runtime lacking those globals throws on import.
 * `@nolag/react-native` installs a guarded polyfill; if you import this entry
 * directly, make sure they exist.
 */

import { NoLag as NoLagClient } from "./client";
import { createWebSocket } from "./websocket/browser";
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

// NOTE: the WebRTC module is intentionally absent here. See the header.

/**
 * Create a NoLag client for React Native
 *
 * Pass an access token string, or (strongly preferred on mobile) a
 * TokenProvider function that returns a short-lived client token (JWT) minted
 * by your backend. Never ship a long-lived actor access token inside an app
 * bundle: it is extractable from the IPA or APK.
 */
export const NoLag = (token: string | TokenProvider, options?: NoLagOptions): NoLagClient => {
  return new NoLagClient(createWebSocket, token, options);
};

// Re-export the factory as default
export default NoLag;
