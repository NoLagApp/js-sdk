/**
 * WebRTC Environment Detection and Polyfill
 *
 * Provides RTCPeerConnection for both browser and Node.js environments.
 * In Node.js, requires the 'wrtc' package to be installed.
 */
interface WrtcModule {
    RTCPeerConnection: typeof RTCPeerConnection;
    RTCSessionDescription: typeof RTCSessionDescription;
    RTCIceCandidate: typeof RTCIceCandidate;
    MediaStream: typeof MediaStream;
    MediaStreamTrack: typeof MediaStreamTrack;
    nonstandard?: {
        RTCAudioSource: unknown;
        RTCVideoSource: unknown;
    };
}
/**
 * Check if running in a browser environment
 */
export declare function isBrowser(): boolean;
/**
 * Check if running in Node.js environment
 */
export declare function isNode(): boolean;
/**
 * Get RTCPeerConnection constructor for the current environment
 * @throws Error if WebRTC is not available
 */
export declare function getRTCPeerConnection(): typeof RTCPeerConnection;
/**
 * Get MediaStream constructor for the current environment
 * @throws Error if MediaStream is not available
 */
export declare function getMediaStream(): typeof MediaStream;
/**
 * Check if WebRTC is available in the current environment
 */
export declare function isWebRTCAvailable(): boolean;
/**
 * Get the wrtc nonstandard APIs for Node.js (audio/video sources)
 * Returns null in browser or if wrtc is not installed
 */
export declare function getWrtcNonstandard(): WrtcModule["nonstandard"] | null;
export {};
