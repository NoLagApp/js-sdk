/**
 * NoLag SDK v2
 * Node.js entry point
 */

import { NoLagSocket } from "./client";
import { NoLagOptions } from "./types";

export { NoLagSocket } from "./client";
export * from "./types";

/**
 * Create a NoLag socket connection
 *
 * @example
 * ```typescript
 * import { nolag } from "@nolag/sdk";
 *
 * const socket = nolag("your_actor_token");
 *
 * socket.on("connect", () => {
 *   console.log("Connected!");
 *   socket.setPresence({ username: "Alice", status: "online" });
 *   socket.subscribe("myapp.lobby.messages");
 * });
 *
 * socket.on("myapp.lobby.messages", (data) => {
 *   console.log("Received:", data);
 * });
 *
 * socket.emit("myapp.lobby.messages", { text: "Hello!" });
 *
 * await socket.connect();
 * ```
 */
export function nolag(token: string, options?: NoLagOptions): NoLagSocket {
  return new NoLagSocket(token, options);
}

export default nolag;
