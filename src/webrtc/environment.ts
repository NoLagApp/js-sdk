/**
 * WebRTC Environment Detection and Polyfill
 *
 * Provides RTCPeerConnection for both browser and Node.js environments.
 * In Node.js, requires the 'wrtc' package to be installed.
 */

// Type definitions for wrtc package
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

// Cached wrtc module
let wrtcModule: WrtcModule | null = null;
let wrtcLoadAttempted = false;

/**
 * Check if running in a browser environment
 */
export function isBrowser(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.RTCPeerConnection !== "undefined"
  );
}

/**
 * Check if running in Node.js environment
 */
export function isNode(): boolean {
  return (
    typeof process !== "undefined" &&
    process.versions != null &&
    process.versions.node != null
  );
}

/**
 * Try to load the wrtc module (Node.js only)
 */
function tryLoadWrtc(): WrtcModule | null {
  if (wrtcLoadAttempted) {
    return wrtcModule;
  }

  wrtcLoadAttempted = true;

  if (!isNode()) {
    return null;
  }

  try {
    // Dynamic import for Node.js
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    wrtcModule = require("wrtc") as WrtcModule;
    return wrtcModule;
  } catch {
    // wrtc not installed
    return null;
  }
}

/**
 * Get RTCPeerConnection constructor for the current environment
 * @throws Error if WebRTC is not available
 */
export function getRTCPeerConnection(): typeof RTCPeerConnection {
  // Browser environment
  if (isBrowser()) {
    return window.RTCPeerConnection;
  }

  // Node.js environment - try wrtc
  const wrtc = tryLoadWrtc();
  if (wrtc) {
    return wrtc.RTCPeerConnection;
  }

  throw new Error(
    "WebRTC is not available. In Node.js, install the 'wrtc' package: npm install wrtc"
  );
}

/**
 * Get MediaStream constructor for the current environment
 * @throws Error if MediaStream is not available
 */
export function getMediaStream(): typeof MediaStream {
  // Browser environment
  if (isBrowser()) {
    return window.MediaStream;
  }

  // Node.js environment - try wrtc
  const wrtc = tryLoadWrtc();
  if (wrtc) {
    return wrtc.MediaStream;
  }

  throw new Error(
    "MediaStream is not available. In Node.js, install the 'wrtc' package: npm install wrtc"
  );
}

/**
 * Check if WebRTC is available in the current environment
 */
export function isWebRTCAvailable(): boolean {
  if (isBrowser()) {
    return typeof window.RTCPeerConnection !== "undefined";
  }

  if (isNode()) {
    const wrtc = tryLoadWrtc();
    return wrtc !== null;
  }

  return false;
}

/**
 * Get the wrtc nonstandard APIs for Node.js (audio/video sources)
 * Returns null in browser or if wrtc is not installed
 */
export function getWrtcNonstandard(): WrtcModule["nonstandard"] | null {
  if (!isNode()) {
    return null;
  }

  const wrtc = tryLoadWrtc();
  return wrtc?.nonstandard ?? null;
}
