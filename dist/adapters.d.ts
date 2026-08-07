/**
 * Platform adapters.
 *
 * The core client has no opinion about how a host reports app lifecycle or
 * network reachability. Browsers expose `document.visibilitychange` and
 * `window.online`/`offline`; React Native exposes `AppState` and NetInfo;
 * Node exposes neither. Rather than sniff the environment, the client takes
 * these as injectable adapters and falls back to the DOM implementations when
 * they are available.
 */
/** Foreground/background state of the host application. */
export type AppLifecycleState = "active" | "background";
export interface LifecycleAdapter {
    /**
     * Subscribe to foreground/background transitions.
     * Returns an unsubscribe function.
     */
    onStateChange(handler: (state: AppLifecycleState) => void): () => void;
}
export interface NetworkAdapter {
    /**
     * Subscribe to connectivity changes. `reachable` is true once the host
     * believes the network is usable again.
     * Returns an unsubscribe function.
     */
    onReachabilityChange(handler: (reachable: boolean) => void): () => void;
}
/**
 * Lifecycle adapter backed by the Page Visibility API.
 * Returns null where there is no `document` (Node, React Native), leaving the
 * client without a lifecycle signal unless one is injected.
 */
export declare function createDocumentLifecycleAdapter(): LifecycleAdapter | null;
/**
 * Network adapter backed by the browser's online/offline events.
 * Returns null where there is no `window` (Node, React Native).
 *
 * Note these events only report whether the machine has *a* network, not
 * whether it can actually reach anything. They are a useful hint for dropping
 * reconnect backoff early, not a guarantee.
 */
export declare function createWindowNetworkAdapter(): NetworkAdapter | null;
