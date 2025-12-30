/**
 * WebRTC Module for NoLag SDK
 *
 * Provides peer-to-peer video/audio connections using NoLag as the signaling server.
 * Works in both browser and Node.js environments.
 *
 * In Node.js, requires the 'wrtc' package:
 * ```bash
 * npm install wrtc
 * ```
 */
export { WebRTCManager } from "./WebRTCManager";
export { isWebRTCAvailable, isBrowser, isNode, getWrtcNonstandard, } from "./environment";
export type { WebRTCOptions, WebRTCEvent, WebRTCEvents, PeerState, SignalingMessage, OfferMessage, AnswerMessage, CandidateMessage, StateMessage, } from "./types";
