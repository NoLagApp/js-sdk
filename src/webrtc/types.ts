/**
 * WebRTC Types for NoLag SDK
 */

/**
 * Configuration options for WebRTCManager
 */
export interface WebRTCOptions {
  /** STUN/TURN servers for ICE negotiation */
  iceServers?: RTCIceServer[];
  /** App name for topic prefix */
  app: string;
  /** Room slug for topic prefix */
  room: string;
}

/**
 * Internal state for a peer connection
 */
export interface PeerState {
  /** Remote actor's token ID */
  actorId: string;
  /** The RTCPeerConnection instance */
  pc: RTCPeerConnection;
  /** Whether this peer is "polite" in perfect negotiation */
  polite: boolean;
  /** Currently making an offer */
  makingOffer: boolean;
  /** Should ignore incoming offers (collision handling) */
  ignoreOffer: boolean;
  /** Remote media stream once connected */
  remoteStream?: MediaStream;
}

/**
 * Signaling message for SDP offer
 */
export interface OfferMessage {
  type: "offer";
  senderActorId: string;
  targetActorId: string;
  sessionId: string;
  sdp: string;
}

/**
 * Signaling message for SDP answer
 */
export interface AnswerMessage {
  type: "answer";
  senderActorId: string;
  targetActorId: string;
  sessionId: string;
  sdp: string;
}

/**
 * Signaling message for ICE candidate
 */
export interface CandidateMessage {
  senderActorId: string;
  targetActorId: string;
  candidate: RTCIceCandidateInit;
}

/**
 * Signaling message for connection state broadcast
 */
export interface StateMessage {
  actorId: string;
  state: "ready" | "connecting" | "connected" | "disconnected";
  mediaState?: {
    video: boolean;
    audio: boolean;
    screen: boolean;
  };
}

/**
 * Union of all signaling message types
 */
export type SignalingMessage =
  | OfferMessage
  | AnswerMessage
  | CandidateMessage
  | StateMessage;

/**
 * Events emitted by WebRTCManager
 */
export interface WebRTCEvents {
  /** Fired when a peer connection is established with remote stream */
  peerConnected: (actorId: string, stream: MediaStream) => void;
  /** Fired when a peer disconnects */
  peerDisconnected: (actorId: string) => void;
  /** Fired when a new track is added from a peer */
  peerTrack: (actorId: string, track: MediaStreamTrack, stream: MediaStream) => void;
  /** Fired when local stream is set */
  localStream: (stream: MediaStream) => void;
  /** Fired on errors */
  error: (error: Error) => void;
}

/**
 * Event names for WebRTCManager
 */
export type WebRTCEvent = keyof WebRTCEvents;
