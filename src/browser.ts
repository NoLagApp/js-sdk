/**
 * NoLag SDK
 * Real-time messaging for Browser and React Native
 */

import { NoLag as NoLagClient } from "./client";
import { createWebSocket } from "./websocket/browser";
import type { NoLagOptions } from "./types";

export { NoLagSocket } from "./client";
export * from "./types";
export type { WebSocketFactory, IUnifiedWebSocket } from "./websocket/types";

// Export REST API client
export { NoLagApi, NoLagApiError } from "./api";
export * from "./api-types";

/**
 * Create a NoLag client for Browser/React Native
 */
export const NoLag = (token: string, options?: NoLagOptions): NoLagClient => {
  return new NoLagClient(createWebSocket, token, options);
};

// Re-export the factory as default
export default NoLag;
