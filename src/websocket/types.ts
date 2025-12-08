/**
 * Unified WebSocket interface
 * Abstracts differences between browser WebSocket and Node.js ws package
 */
export interface IUnifiedWebSocket {
  send(data: ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  set onOpen(callback: ((event: unknown) => void) | undefined);
  set onMessage(callback: ((data: ArrayBuffer) => void) | undefined);
  set onClose(callback: ((event: unknown) => void) | undefined);
  set onError(callback: ((event: unknown) => void) | undefined);
  readonly readyState: number;
}

export type WebSocketFactory = (url: string) => IUnifiedWebSocket;

// WebSocket ready states (same for browser and ws package)
export const WS_READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;
