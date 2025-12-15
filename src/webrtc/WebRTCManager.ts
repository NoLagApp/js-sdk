/**
 * WebRTC Manager for NoLag SDK
 *
 * Provides peer-to-peer video/audio connections using NoLag as the signaling server.
 * Uses the "Perfect Negotiation" pattern to handle offer collisions gracefully.
 *
 * @example
 * ```typescript
 * const client = NoLag(token);
 * await client.connect();
 *
 * const webrtc = new WebRTCManager(client, {
 *   app: 'video-chat',
 *   room: 'meeting-123',
 *   iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
 * });
 *
 * const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
 * webrtc.setLocalStream(localStream);
 *
 * webrtc.on('peerConnected', (actorId, stream) => {
 *   // Attach stream to video element
 * });
 *
 * await webrtc.start();
 * ```
 */

import type { NoLag } from "../client";
import type { ActorPresence, MessageMeta, RoomContext } from "../types";
import type {
  WebRTCOptions,
  PeerState,
  OfferMessage,
  AnswerMessage,
  CandidateMessage,
  WebRTCEvent,
} from "./types";

// Default STUN servers (free, public)
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventCallback = (...args: any[]) => void;

/**
 * WebRTC Manager
 *
 * Manages peer-to-peer WebRTC connections using NoLag for signaling.
 */
export class WebRTCManager {
  private _client: NoLag;
  private _room: RoomContext;
  private _options: Required<WebRTCOptions>;
  private _localStream: MediaStream | null = null;
  private _peers: Map<string, PeerState> = new Map();
  private _started = false;
  private _eventHandlers: Map<string, Set<EventCallback>> = new Map();

  // Bound handlers for cleanup
  private _boundHandlers: {
    onPresenceJoin?: (actor: ActorPresence) => void;
    onPresenceLeave?: (actor: ActorPresence) => void;
    onOffer?: (data: unknown, meta: MessageMeta) => void;
    onAnswer?: (data: unknown, meta: MessageMeta) => void;
    onCandidate?: (data: unknown, meta: MessageMeta) => void;
  } = {};

  constructor(client: NoLag, options: WebRTCOptions) {
    this._client = client;
    this._options = {
      iceServers: options.iceServers ?? DEFAULT_ICE_SERVERS,
      app: options.app,
      room: options.room,
    };
    // Create room context for room-scoped presence
    this._room = client.setApp(options.app).setRoom(options.room);
  }

  // ============ Public API ============

  /**
   * Get the topic prefix for this room
   */
  get topicPrefix(): string {
    return `${this._options.app}/${this._options.room}`;
  }

  /**
   * Get the local actor ID
   */
  get myActorId(): string | null {
    return this._client.actorId;
  }

  /**
   * Check if manager is started
   */
  get isStarted(): boolean {
    return this._started;
  }

  /**
   * Set the local media stream to share with peers
   */
  setLocalStream(stream: MediaStream): void {
    this._localStream = stream;
    this._emit("localStream", stream);

    // Add tracks to existing peer connections
    for (const peer of this._peers.values()) {
      this._addTracksToConnection(peer.pc, stream);
    }
  }

  /**
   * Get the local media stream
   */
  getLocalStream(): MediaStream | null {
    return this._localStream;
  }

  /**
   * Get a peer's remote stream
   */
  getRemoteStream(actorId: string): MediaStream | undefined {
    return this._peers.get(actorId)?.remoteStream;
  }

  /**
   * Get list of connected peer IDs
   */
  getPeers(): string[] {
    return Array.from(this._peers.keys());
  }

  /**
   * Check if connected to a specific peer
   */
  isConnected(actorId: string): boolean {
    const peer = this._peers.get(actorId);
    return peer?.pc.connectionState === "connected";
  }

  /**
   * Start the WebRTC manager
   *
   * - Subscribes to signaling topics
   * - Listens for presence events
   * - Initiates connections to existing peers
   */
  async start(): Promise<void> {
    if (this._started) {
      throw new Error("WebRTCManager already started");
    }

    if (!this._client.connected) {
      throw new Error("NoLag client not connected");
    }

    if (!this.myActorId) {
      throw new Error("Actor ID not available");
    }

    this._started = true;

    // Create bound handlers for cleanup later
    this._boundHandlers = {
      onPresenceJoin: (actor: ActorPresence) => this._onPresenceJoin(actor),
      onPresenceLeave: (actor: ActorPresence) => this._onPresenceLeave(actor),
      onOffer: (data: unknown, meta: MessageMeta) =>
        this._handleOffer(data as OfferMessage, meta),
      onAnswer: (data: unknown, meta: MessageMeta) =>
        this._handleAnswer(data as AnswerMessage, meta),
      onCandidate: (data: unknown, meta: MessageMeta) =>
        this._handleCandidate(data as CandidateMessage, meta),
    };

    // Subscribe to signaling topics
    // Note: Using colons instead of slashes because topic names can't contain
    // forward slashes (they're used as path separators in app/room/topic pattern)
    const topics = ["webrtc:offer", "webrtc:answer", "webrtc:candidate"];
    for (const topic of topics) {
      this._client.subscribe(`${this.topicPrefix}/${topic}`);
    }

    // Listen to signaling messages
    this._client.on(
      `${this.topicPrefix}/webrtc:offer`,
      this._boundHandlers.onOffer!
    );
    this._client.on(
      `${this.topicPrefix}/webrtc:answer`,
      this._boundHandlers.onAnswer!
    );
    this._client.on(
      `${this.topicPrefix}/webrtc:candidate`,
      this._boundHandlers.onCandidate!
    );

    // Listen to presence events
    this._client.on("presence:join", this._boundHandlers.onPresenceJoin!);
    this._client.on("presence:leave", this._boundHandlers.onPresenceLeave!);

    // Set presence with webrtcReady flag (room-scoped)
    this._room.setPresence({
      webrtcReady: true,
    });

    // Fetch current presence and connect to existing WebRTC-ready peers
    try {
      const presenceList = await this._room.fetchPresence();
      for (const actor of presenceList) {
        if (
          actor.actorTokenId !== this.myActorId &&
          actor.presence?.webrtcReady
        ) {
          await this._createPeerConnection(actor.actorTokenId);
        }
      }
    } catch (err) {
      // Presence fetch failed, we'll connect as peers join
      console.warn("Failed to fetch initial presence:", err);
    }
  }

  /**
   * Stop the WebRTC manager
   *
   * - Closes all peer connections
   * - Unsubscribes from signaling topics
   * - Removes event listeners
   */
  stop(): void {
    if (!this._started) return;

    this._started = false;

    // Close all peer connections
    for (const [actorId, peer] of this._peers) {
      peer.pc.close();
      this._emit("peerDisconnected", actorId);
    }
    this._peers.clear();

    // Unsubscribe from signaling topics
    const topics = ["webrtc:offer", "webrtc:answer", "webrtc:candidate"];
    for (const topic of topics) {
      this._client.unsubscribe(`${this.topicPrefix}/${topic}`);
    }

    // Remove message handlers
    if (this._boundHandlers.onOffer) {
      this._client.off(
        `${this.topicPrefix}/webrtc:offer`,
        this._boundHandlers.onOffer as any
      );
    }
    if (this._boundHandlers.onAnswer) {
      this._client.off(
        `${this.topicPrefix}/webrtc:answer`,
        this._boundHandlers.onAnswer as any
      );
    }
    if (this._boundHandlers.onCandidate) {
      this._client.off(
        `${this.topicPrefix}/webrtc:candidate`,
        this._boundHandlers.onCandidate as any
      );
    }

    // Remove presence handlers
    if (this._boundHandlers.onPresenceJoin) {
      this._client.off(
        "presence:join",
        this._boundHandlers.onPresenceJoin as any
      );
    }
    if (this._boundHandlers.onPresenceLeave) {
      this._client.off(
        "presence:leave",
        this._boundHandlers.onPresenceLeave as any
      );
    }

    // Clear presence webrtcReady flag (room-scoped)
    this._room.setPresence({
      webrtcReady: false,
    });

    this._boundHandlers = {};
  }

  // ============ Event Emitter ============

  /**
   * Register an event handler
   */
  on(event: "peerConnected", handler: (actorId: string, stream: MediaStream) => void): this;
  on(event: "peerDisconnected", handler: (actorId: string) => void): this;
  on(event: "peerTrack", handler: (actorId: string, track: MediaStreamTrack, stream: MediaStream) => void): this;
  on(event: "localStream", handler: (stream: MediaStream) => void): this;
  on(event: "error", handler: (error: Error) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (...args: any[]) => void): this {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event)!.add(handler);
    return this;
  }

  /**
   * Remove an event handler
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, handler?: (...args: any[]) => void): this {
    if (handler) {
      this._eventHandlers.get(event)?.delete(handler);
    } else {
      this._eventHandlers.delete(event);
    }
    return this;
  }

  // ============ Private Methods ============

  private _emit(event: string, ...args: unknown[]): void {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (e) {
          console.error(`Error in WebRTC event handler for ${event}:`, e);
        }
      }
    }
  }

  private _onPresenceJoin(actor: ActorPresence): void {
    if (
      actor.actorTokenId !== this.myActorId &&
      actor.presence?.webrtcReady &&
      !this._peers.has(actor.actorTokenId)
    ) {
      this._createPeerConnection(actor.actorTokenId).catch((err) => {
        this._emit("error", err);
      });
    }
  }

  private _onPresenceLeave(actor: ActorPresence): void {
    const peer = this._peers.get(actor.actorTokenId);
    if (peer) {
      peer.pc.close();
      this._peers.delete(actor.actorTokenId);
      this._emit("peerDisconnected", actor.actorTokenId);
    }
  }

  private async _createPeerConnection(remoteActorId: string): Promise<PeerState> {
    const config: RTCConfiguration = {
      iceServers: this._options.iceServers,
    };

    const pc = new RTCPeerConnection(config);

    // Determine politeness for perfect negotiation
    // Lower actorId is "polite" and will yield on collision
    const polite = this.myActorId! < remoteActorId;

    const peerState: PeerState = {
      actorId: remoteActorId,
      pc,
      polite,
      makingOffer: false,
      ignoreOffer: false,
    };

    this._peers.set(remoteActorId, peerState);

    // Add local tracks if available
    if (this._localStream) {
      this._addTracksToConnection(pc, this._localStream);
    }

    // Handle ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this._sendCandidate(remoteActorId, candidate.toJSON());
      }
    };

    // Handle remote tracks
    pc.ontrack = ({ track, streams }) => {
      const stream = streams[0] || new MediaStream([track]);
      peerState.remoteStream = stream;
      this._emit("peerTrack", remoteActorId, track, stream);
      this._emit("peerConnected", remoteActorId, stream);
    };

    // Handle negotiation needed (perfect negotiation pattern)
    pc.onnegotiationneeded = async () => {
      try {
        peerState.makingOffer = true;
        await pc.setLocalDescription();
        this._sendOffer(remoteActorId, pc.localDescription!);
      } catch (err) {
        this._emit("error", err as Error);
      } finally {
        peerState.makingOffer = false;
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        this._peers.delete(remoteActorId);
        this._emit("peerDisconnected", remoteActorId);
      }
    };

    // Handle ICE connection state for debugging
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") {
        // ICE restart could be attempted here
        console.warn(`ICE connection failed for peer ${remoteActorId}`);
      }
    };

    return peerState;
  }

  private async _handleOffer(data: OfferMessage, meta: MessageMeta): Promise<void> {
    // Check if this offer is for us
    if (data.targetActorId !== this.myActorId) return;

    const senderActorId = data.senderActorId;
    if (!senderActorId) return;

    let peer = this._peers.get(senderActorId);
    if (!peer) {
      peer = await this._createPeerConnection(senderActorId);
    }

    const { pc, makingOffer, polite } = peer;

    // Perfect negotiation: handle offer collision
    const offerCollision = makingOffer || pc.signalingState !== "stable";
    peer.ignoreOffer = !polite && offerCollision;

    if (peer.ignoreOffer) {
      return;
    }

    try {
      await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
      await pc.setLocalDescription();
      this._sendAnswer(senderActorId, pc.localDescription!, data.sessionId);
    } catch (err) {
      this._emit("error", err as Error);
    }
  }

  private async _handleAnswer(data: AnswerMessage, meta: MessageMeta): Promise<void> {
    // Check if this answer is for us
    if (data.targetActorId !== this.myActorId) return;

    const senderActorId = data.senderActorId;
    if (!senderActorId) return;

    const peer = this._peers.get(senderActorId);
    if (!peer) return;

    try {
      await peer.pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
    } catch (err) {
      this._emit("error", err as Error);
    }
  }

  private async _handleCandidate(data: CandidateMessage, meta: MessageMeta): Promise<void> {
    // Check if this candidate is for us
    if (data.targetActorId !== this.myActorId) return;

    const senderActorId = data.senderActorId;
    if (!senderActorId) return;

    const peer = this._peers.get(senderActorId);
    if (!peer || peer.ignoreOffer) return;

    try {
      await peer.pc.addIceCandidate(data.candidate);
    } catch (err) {
      // Ignore errors if we're ignoring offers
      if (!peer.ignoreOffer) {
        this._emit("error", err as Error);
      }
    }
  }

  private _sendOffer(targetActorId: string, description: RTCSessionDescription): void {
    const sessionId = this._generateSessionId();
    const message: OfferMessage = {
      type: "offer",
      senderActorId: this.myActorId!,
      targetActorId,
      sessionId,
      sdp: description.sdp,
    };
    this._client.emit(`${this.topicPrefix}/webrtc:offer`, message, { echo: false });
  }

  private _sendAnswer(
    targetActorId: string,
    description: RTCSessionDescription,
    sessionId: string
  ): void {
    const message: AnswerMessage = {
      type: "answer",
      senderActorId: this.myActorId!,
      targetActorId,
      sessionId,
      sdp: description.sdp,
    };
    this._client.emit(`${this.topicPrefix}/webrtc:answer`, message, { echo: false });
  }

  private _sendCandidate(targetActorId: string, candidate: RTCIceCandidateInit): void {
    const message: CandidateMessage = {
      senderActorId: this.myActorId!,
      targetActorId,
      candidate,
    };
    this._client.emit(`${this.topicPrefix}/webrtc:candidate`, message, { echo: false });
  }

  private _addTracksToConnection(pc: RTCPeerConnection, stream: MediaStream): void {
    const existingSenders = pc.getSenders();
    for (const track of stream.getTracks()) {
      // Check if track is already added
      const alreadyAdded = existingSenders.some(
        (sender) => sender.track?.id === track.id
      );
      if (!alreadyAdded) {
        pc.addTrack(track, stream);
      }
    }
  }

  private _generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
}
