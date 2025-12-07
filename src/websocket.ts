/**
 * Unified WebSocket interface for browser and Node.js
 */

export interface UnifiedWebSocket {
  send(data: ArrayBuffer): void;
  close(): void;
  onOpen(callback: () => void): void;
  onMessage(callback: (data: ArrayBuffer) => void): void;
  onClose(callback: (code: number, reason: string) => void): void;
  onError(callback: (error: Error) => void): void;
}

/**
 * Create WebSocket for browser environment
 */
function createBrowserWebSocket(url: string): UnifiedWebSocket {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  let onOpenCb: (() => void) | null = null;
  let onMessageCb: ((data: ArrayBuffer) => void) | null = null;
  let onCloseCb: ((code: number, reason: string) => void) | null = null;
  let onErrorCb: ((error: Error) => void) | null = null;

  ws.onopen = () => onOpenCb?.();
  ws.onmessage = (event) => onMessageCb?.(event.data as ArrayBuffer);
  ws.onclose = (event) => onCloseCb?.(event.code, event.reason);
  ws.onerror = () => onErrorCb?.(new Error("WebSocket error"));

  return {
    send: (data) => ws.send(data),
    close: () => ws.close(),
    onOpen: (cb) => { onOpenCb = cb; },
    onMessage: (cb) => { onMessageCb = cb; },
    onClose: (cb) => { onCloseCb = cb; },
    onError: (cb) => { onErrorCb = cb; },
  };
}

/**
 * Create WebSocket for Node.js environment
 */
async function createNodeWebSocket(url: string): Promise<UnifiedWebSocket> {
  // Dynamic import for Node.js ws package
  const { default: WebSocket } = await import("ws");
  const ws = new WebSocket(url);

  let onOpenCb: (() => void) | null = null;
  let onMessageCb: ((data: ArrayBuffer) => void) | null = null;
  let onCloseCb: ((code: number, reason: string) => void) | null = null;
  let onErrorCb: ((error: Error) => void) | null = null;

  ws.on("open", () => onOpenCb?.());
  ws.on("message", (data: Buffer) => {
    // Convert Node Buffer to ArrayBuffer
    const arrayBuffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    );
    onMessageCb?.(arrayBuffer);
  });
  ws.on("close", (code, reason) => onCloseCb?.(code, reason.toString()));
  ws.on("error", (err) => onErrorCb?.(err));

  return {
    send: (data) => ws.send(data),
    close: () => ws.close(),
    onOpen: (cb) => { onOpenCb = cb; },
    onMessage: (cb) => { onMessageCb = cb; },
    onClose: (cb) => { onCloseCb = cb; },
    onError: (cb) => { onErrorCb = cb; },
  };
}

/**
 * Detect if running in browser
 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.WebSocket !== "undefined";
}

/**
 * Create appropriate WebSocket for current environment
 */
export async function createWebSocket(url: string): Promise<UnifiedWebSocket> {
  if (isBrowser()) {
    return createBrowserWebSocket(url);
  }
  return createNodeWebSocket(url);
}
