/**
 * Node.js WebSocket implementation
 * Uses the 'ws' package
 */
import WebSocket from "ws";
import { IUnifiedWebSocket, WebSocketFactory } from "./types";

export const createWebSocket: WebSocketFactory = (url: string): IUnifiedWebSocket => {
  const ws = new WebSocket(url);

  let onOpenCallback: ((event: unknown) => void) | undefined;
  let onMessageCallback: ((data: ArrayBuffer) => void) | undefined;
  let onCloseCallback: ((event: unknown) => void) | undefined;
  let onErrorCallback: ((event: unknown) => void) | undefined;

  ws.on("open", (event) => {
    onOpenCallback?.(event);
  });

  ws.on("message", (data: Buffer) => {
    // Convert Buffer to ArrayBuffer for consistency
    const arrayBuffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    );
    onMessageCallback?.(arrayBuffer);
  });

  ws.on("close", (code, reason) => {
    onCloseCallback?.({ code, reason: reason.toString() });
  });

  ws.on("error", (error) => {
    onErrorCallback?.(error);
  });

  return {
    send(data: ArrayBuffer) {
      ws.send(data);
    },
    close(code?: number, reason?: string) {
      ws.close(code, reason);
    },
    set onOpen(callback: ((event: unknown) => void) | undefined) {
      onOpenCallback = callback;
    },
    set onMessage(callback: ((data: ArrayBuffer) => void) | undefined) {
      onMessageCallback = callback;
    },
    set onClose(callback: ((event: unknown) => void) | undefined) {
      onCloseCallback = callback;
    },
    set onError(callback: ((event: unknown) => void) | undefined) {
      onErrorCallback = callback;
    },
    get readyState() {
      return ws.readyState;
    },
  };
};
