/**
 * MessagePack Transport Protocol
 * Encodes/decodes messages using MessagePack format.
 */

import { encode as msgpackEncode, decode as msgpackDecode } from "@msgpack/msgpack";

/**
 * Message types
 */
export const MessageType = {
  INIT: "init",
  AUTH: "auth",
  ACK: "ack",
  ERROR: "error",
  ALERT: "alert",
  SUBSCRIBE: "subscribe",
  UNSUBSCRIBE: "unsubscribe",
  MESSAGE: "message",
  PRESENCE: "presence",
  PRESENCE_EVENT: "presence_event",
} as const;

export type MessageTypeValue = typeof MessageType[keyof typeof MessageType];

/**
 * Base message structure
 */
export interface BaseMessage {
  type: MessageTypeValue;
}

/**
 * Init message (server -> client)
 */
export interface InitMessage extends BaseMessage {
  type: "init";
}

/**
 * Auth message (client -> server)
 */
export interface AuthMessage extends BaseMessage {
  type: "auth";
  token: string;
  reconnect?: boolean;
}

/**
 * Ack message (server -> client)
 */
export interface AckMessage extends BaseMessage {
  type: "ack";
  id?: string;
  actorId?: string;
  projectId?: string;
  actorType?: string;
  topic?: string;
  action?: string;
}

/**
 * Error message (server -> client)
 */
export interface ErrorMessage extends BaseMessage {
  type: "error";
  message: string;
}

/**
 * Alert message (server -> client)
 */
export interface AlertMessage extends BaseMessage {
  type: "alert";
  message: string;
}

/**
 * Subscribe message (client -> server)
 */
export interface SubscribeMessage extends BaseMessage {
  type: "subscribe";
  topic: string;
}

/**
 * Unsubscribe message (client -> server)
 */
export interface UnsubscribeMessage extends BaseMessage {
  type: "unsubscribe";
  topic: string;
}

/**
 * Topic message (bidirectional)
 */
export interface TopicMessage extends BaseMessage {
  type: "message";
  topic: string;
  data: unknown;
  meta?: {
    from?: string;
  };
}

/**
 * Presence message (client -> server)
 */
export interface PresenceMessage extends BaseMessage {
  type: "presence";
  presence: Record<string, unknown>;
}

/**
 * Presence event message (server -> client)
 */
export interface PresenceEventMessage extends BaseMessage {
  type: "presence_event";
  event: "join" | "leave" | "update";
  data: {
    actorTokenId: string;
    actorType?: string;
    presence?: Record<string, unknown>;
  };
}

/**
 * Union of all message types
 */
export type Message =
  | InitMessage
  | AuthMessage
  | AckMessage
  | ErrorMessage
  | AlertMessage
  | SubscribeMessage
  | UnsubscribeMessage
  | TopicMessage
  | PresenceMessage
  | PresenceEventMessage;

/**
 * Encode a message to MessagePack binary
 */
export function encode(message: Record<string, unknown>): ArrayBuffer {
  const encoded = msgpackEncode(message);
  return encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength
  );
}

/**
 * Decode MessagePack binary to message
 */
export function decode(buffer: ArrayBuffer): Message {
  return msgpackDecode(new Uint8Array(buffer)) as Message;
}

/**
 * Create auth message
 */
export function createAuthMessage(token: string, reconnect = false): ArrayBuffer {
  return encode({
    type: MessageType.AUTH,
    token,
    reconnect,
  });
}

/**
 * Create subscribe message
 */
export function createSubscribeMessage(topic: string): ArrayBuffer {
  return encode({
    type: MessageType.SUBSCRIBE,
    topic,
  });
}

/**
 * Create unsubscribe message
 */
export function createUnsubscribeMessage(topic: string): ArrayBuffer {
  return encode({
    type: MessageType.UNSUBSCRIBE,
    topic,
  });
}

/**
 * Create topic message (publish)
 */
export function createTopicMessage(topic: string, data: unknown): ArrayBuffer {
  return encode({
    type: MessageType.MESSAGE,
    topic,
    data,
  });
}

/**
 * Create presence message
 */
export function createPresenceMessage(presence: Record<string, unknown>): ArrayBuffer {
  return encode({
    type: MessageType.PRESENCE,
    presence,
  });
}

/**
 * Type guards
 */
export function isInitMessage(msg: Message): msg is InitMessage {
  return msg.type === MessageType.INIT;
}

export function isAckMessage(msg: Message): msg is AckMessage {
  return msg.type === MessageType.ACK;
}

export function isErrorMessage(msg: Message): msg is ErrorMessage {
  return msg.type === MessageType.ERROR;
}

export function isAlertMessage(msg: Message): msg is AlertMessage {
  return msg.type === MessageType.ALERT;
}

export function isTopicMessage(msg: Message): msg is TopicMessage {
  return msg.type === MessageType.MESSAGE;
}

export function isPresenceEventMessage(msg: Message): msg is PresenceEventMessage {
  return msg.type === MessageType.PRESENCE_EVENT;
}
