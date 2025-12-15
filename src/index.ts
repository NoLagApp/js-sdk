/**
 * NoLag SDK
 * Real-time messaging for Node.js
 */

import { NoLag as NoLagClient } from "./client";
import { createWebSocket } from "./websocket/node";
import type { NoLagOptions } from "./types";

export { NoLagSocket } from "./client";
export * from "./types";
export type { WebSocketFactory, IUnifiedWebSocket } from "./websocket/types";

// Export REST API client
export { NoLagApi, NoLagApiError } from "./api";
export * from "./api-types";

// Export WebRTC module
export { WebRTCManager } from "./webrtc";
export type { WebRTCOptions, WebRTCEvent, WebRTCEvents } from "./webrtc";

/**
 * Create a NoLag client for Node.js
 */
export const NoLag = (token: string, options?: NoLagOptions): NoLagClient => {
  return new NoLagClient(createWebSocket, token, options);
};

// Re-export the factory as default
export default NoLag;
