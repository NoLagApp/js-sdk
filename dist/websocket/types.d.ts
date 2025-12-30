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
export declare const WS_READY_STATE: {
    readonly CONNECTING: 0;
    readonly OPEN: 1;
    readonly CLOSING: 2;
    readonly CLOSED: 3;
};
