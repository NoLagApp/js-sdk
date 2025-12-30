/**
 * WebRTC Manager for NoLag SDK
 *
 * Provides peer-to-peer video/audio connections using NoLag as the signaling server.
 * Uses the "Perfect Negotiation" pattern to handle offer collisions gracefully.
 *
 * Works in both browser and Node.js environments. In Node.js, requires the 'wrtc' package:
 * ```bash
 * npm install wrtc
 * ```
 *
 * @example Browser
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
 *
 * @example Node.js (AI Voice Bot)
 * ```typescript
 * import { NoLag, WebRTCManager } from '@nolag/js-sdk';
 * import wrtc from 'wrtc';
 *
 * const client = NoLag(token);
 * await client.connect();
 *
 * const webrtc = new WebRTCManager(client, {
 *   app: 'video-chat',
 *   room: 'meeting-123'
 * });
 *
 * webrtc.on('peerConnected', (actorId, stream) => {
 *   // Process incoming audio with speech-to-text
 * });
 *
 * await webrtc.start();
 * ```
 */
import type { NoLag } from "../client";
import type { WebRTCOptions } from "./types";
/**
 * WebRTC Manager
 *
 * Manages peer-to-peer WebRTC connections using NoLag for signaling.
 */
export declare class WebRTCManager {
    private _client;
    private _room;
    private _options;
    private _localStream;
    private _peers;
    private _started;
    private _eventHandlers;
    private _boundHandlers;
    constructor(client: NoLag, options: WebRTCOptions);
    /**
     * Get the topic prefix for this room
     */
    get topicPrefix(): string;
    /**
     * Get the local actor ID
     */
    get myActorId(): string | null;
    /**
     * Check if manager is started
     */
    get isStarted(): boolean;
    /**
     * Set the local media stream to share with peers
     */
    setLocalStream(stream: MediaStream): void;
    /**
     * Get the local media stream
     */
    getLocalStream(): MediaStream | null;
    /**
     * Get a peer's remote stream
     */
    getRemoteStream(actorId: string): MediaStream | undefined;
    /**
     * Get list of connected peer IDs
     */
    getPeers(): string[];
    /**
     * Check if connected to a specific peer
     */
    isConnected(actorId: string): boolean;
    /**
     * Start the WebRTC manager
     *
     * - Subscribes to signaling topics
     * - Listens for presence events
     * - Initiates connections to existing peers
     */
    start(): Promise<void>;
    /**
     * Stop the WebRTC manager
     *
     * - Closes all peer connections
     * - Unsubscribes from signaling topics
     * - Removes event listeners
     */
    stop(): void;
    /**
     * Register an event handler
     */
    on(event: "peerConnected", handler: (actorId: string, stream: MediaStream) => void): this;
    on(event: "peerDisconnected", handler: (actorId: string) => void): this;
    on(event: "peerTrack", handler: (actorId: string, track: MediaStreamTrack, stream: MediaStream) => void): this;
    on(event: "localStream", handler: (stream: MediaStream) => void): this;
    on(event: "error", handler: (error: Error) => void): this;
    /**
     * Remove an event handler
     */
    off(event: string, handler?: (...args: any[]) => void): this;
    private _emit;
    private _onPresenceJoin;
    private _onPresenceLeave;
    private _createPeerConnection;
    private _handleOffer;
    private _handleAnswer;
    private _handleCandidate;
    private _sendOffer;
    private _sendAnswer;
    private _sendCandidate;
    private _addTracksToConnection;
    private _generateSessionId;
}
