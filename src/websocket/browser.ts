/**
 * Browser WebSocket implementation
 * Uses the native WebSocket API (also works in React Native)
 */
import { IUnifiedWebSocket, WebSocketFactory } from "./types";

export const createWebSocket: WebSocketFactory = (url: string): IUnifiedWebSocket => {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  let onOpenCallback: ((event: unknown) => void) | undefined;
  let onMessageCallback: ((data: ArrayBuffer) => void) | undefined;
  let onCloseCallback: ((event: unknown) => void) | undefined;
  let onErrorCallback: ((event: unknown) => void) | undefined;

  ws.onopen = (event) => {
    onOpenCallback?.(event);
  };

  ws.onmessage = (event) => {
    onMessageCallback?.(event.data);
  };

  ws.onclose = (event) => {
    onCloseCallback?.(event);
  };

  ws.onerror = (event) => {
    onErrorCallback?.(event);
  };

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
