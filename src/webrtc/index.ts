/**
 * WebRTC Module for NoLag SDK
 *
 * Provides peer-to-peer video/audio connections using NoLag as the signaling server.
 */

export { WebRTCManager } from "./WebRTCManager";
export type {
  WebRTCOptions,
  WebRTCEvent,
  WebRTCEvents,
  PeerState,
  SignalingMessage,
  OfferMessage,
  AnswerMessage,
  CandidateMessage,
  StateMessage,
} from "./types";
