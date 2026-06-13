import { describe, it, expect, vi, beforeEach } from "vitest";
import { encode as msgpackEncode, decode as msgpackDecode } from "@msgpack/msgpack";
import { NoLag } from "../../src/client";
import { NoLagEncodeError, NoLagServerError } from "../../src/errors";

/**
 * Unit tests for the loud-failure behaviors:
 *  - encode errors throw with op/topic context (never silently dropped)
 *  - not-open sends error instead of debug-log-and-drop
 *  - subscribe callbacks resolve on real `subscribed` frames and reject on
 *    topic-matched error frames (no more optimistic cb(null))
 *  - publish callbacks correlate msgRef `published` acks on v2 brokers
 *  - server error frames surface as structured NoLagServerError
 *  - protocolVersion negotiation falls back to 1 for pre-v2 brokers
 */

class MockWebSocket {
  readyState = 0; // CONNECTING
  sent: any[] = [];
  onOpen: (() => void) | null = null;
  onMessage: ((data: ArrayBuffer | string) => void) | null = null;
  onClose: ((code: number, reason: string) => void) | null = null;
  onError: ((err: Error) => void) | null = null;

  send(payload: ArrayBuffer) {
    this.sent.push(msgpackDecode(new Uint8Array(payload as any)));
  }
  close() {
    this.readyState = 3;
    this.onClose?.(1000, "closed");
  }

  // test helpers
  open() {
    this.readyState = 1; // OPEN
    this.onOpen?.();
  }
  receive(frame: object) {
    const buf = msgpackEncode(frame);
    this.onMessage?.(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  }
}

function makeClient(opts: Record<string, unknown> = {}) {
  let ws!: MockWebSocket;
  const factory = () => {
    ws = new MockWebSocket();
    return ws as any;
  };
  const client = new NoLag(factory as any, "test-token", {
    reconnect: false,
    heartbeatInterval: 0,
    ...opts,
  } as any);
  return { client, getWs: () => ws };
}

async function connect(client: NoLag, getWs: () => MockWebSocket, authExtra: Record<string, unknown> = {}) {
  const p = client.connect();
  // wait a tick for the ws to be constructed and opened
  await new Promise((r) => setTimeout(r, 0));
  getWs().open();
  await new Promise((r) => setTimeout(r, 0));
  getWs().receive({
    type: "auth",
    success: true,
    actorTokenId: "actor-1",
    projectId: "proj-1",
    actorType: "user",
    restoredSubscriptions: [],
    ...authExtra,
  });
  await p;
}

describe("protocol version negotiation", () => {
  it("sends protocolVersion 2 in auth and adopts the broker's response", async () => {
    const { client, getWs } = makeClient();
    await connect(client, getWs, { protocolVersion: 2 });
    const authMsg = getWs().sent.find((m) => m.type === "auth");
    expect(authMsg.protocolVersion).toBe(2);
    expect(client.protocolVersion).toBe(2);
  });

  it("falls back to v1 when the broker omits protocolVersion", async () => {
    const { client, getWs } = makeClient();
    await connect(client, getWs);
    expect(client.protocolVersion).toBe(1);
  });
});

describe("loud sends", () => {
  it("throws NoLagEncodeError with topic context for unencodable payloads", async () => {
    const { client, getWs } = makeClient();
    await connect(client, getWs);
    const errors: Error[] = [];
    client.on("error", (e: Error) => errors.push(e));

    const circular: any = {};
    circular.self = circular;

    expect(() => client.emit("room/topic", circular)).toThrowError(NoLagEncodeError);
    try {
      client.emit("room/topic", circular);
    } catch (e) {
      expect((e as NoLagEncodeError).message).toContain("room/topic");
    }
    expect(errors.length).toBeGreaterThan(0);
  });

  it("routes encode errors to the callback when one is supplied", async () => {
    const { client, getWs } = makeClient();
    await connect(client, getWs);
    const circular: any = {};
    circular.self = circular;

    const cb = vi.fn();
    client.emit("room/topic", circular, cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toBeInstanceOf(NoLagEncodeError);
  });

  it("errors when emitting while not connected", () => {
    const { client } = makeClient();
    const cb = vi.fn();
    client.emit("room/topic", { a: 1 }, cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});

describe("real subscribe acks", () => {
  it("resolves the callback on the broker's subscribed frame, not optimistically", async () => {
    const { client, getWs } = makeClient();
    await connect(client, getWs);

    const cb = vi.fn();
    client.subscribe("room/topic", cb);
    expect(cb).not.toHaveBeenCalled(); // no more lying cb(null)

    getWs().receive({ type: "subscribed", topic: "room/topic", loadBalance: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(cb).toHaveBeenCalledWith(null);
  });

  it("rejects the callback on a topic-matched error frame", async () => {
    const { client, getWs } = makeClient();
    await connect(client, getWs);
    client.on("error", () => {}); // observe, don't throw

    const cb = vi.fn();
    client.subscribe("room/forbidden", cb);
    getWs().receive({ type: "error", error: "not_authorized", topic: "room/forbidden" });
    await new Promise((r) => setTimeout(r, 0));

    expect(cb).toHaveBeenCalledTimes(1);
    const err = cb.mock.calls[0][0] as NoLagServerError;
    expect(err).toBeInstanceOf(NoLagServerError);
    expect(err.error).toBe("not_authorized");
    expect(err.topic).toBe("room/forbidden");
  });

  it("surfaces 42940 unknown_topic with its hint", async () => {
    const { client, getWs } = makeClient();
    await connect(client, getWs, { protocolVersion: 2 });
    client.on("error", () => {});

    const cb = vi.fn();
    client.subscribe("app/new-room/events", cb);
    getWs().receive({
      type: "error",
      code: 42940,
      error: "unknown_topic",
      topic: "app/new-room/events",
      hint: "room is not configured and auto-provisioning is not available on this deployment",
    });
    await new Promise((r) => setTimeout(r, 0));

    const err = cb.mock.calls[0][0] as NoLagServerError;
    expect(err.code).toBe(42940);
    expect(err.message).toContain("auto-provisioning");
  });
});

describe("publish acks (v2)", () => {
  it("attaches msgRef and resolves on the published frame", async () => {
    const { client, getWs } = makeClient();
    await connect(client, getWs, { protocolVersion: 2 });

    const cb = vi.fn();
    client.emit("room/topic", { a: 1 }, cb);
    expect(cb).not.toHaveBeenCalled();

    const sentPublish = getWs().sent.find((m) => m.type === "publish");
    expect(sentPublish.msgRef).toBeTruthy();

    getWs().receive({ type: "published", topic: "room/topic", msgRef: sentPublish.msgRef });
    await new Promise((r) => setTimeout(r, 0));
    expect(cb).toHaveBeenCalledWith(null);
  });

  it("rejects on a msgRef-matched error frame", async () => {
    const { client, getWs } = makeClient();
    await connect(client, getWs, { protocolVersion: 2 });
    client.on("error", () => {});

    const cb = vi.fn();
    client.emit("room/topic", { a: 1 }, cb);
    const sentPublish = getWs().sent.find((m) => m.type === "publish");

    getWs().receive({
      type: "error",
      code: 42940,
      error: "unknown_topic",
      topic: "room/topic",
      msgRef: sentPublish.msgRef,
    });
    await new Promise((r) => setTimeout(r, 0));
    expect((cb.mock.calls[0][0] as NoLagServerError).code).toBe(42940);
  });

  it("keeps optimistic semantics on v1 brokers (no msgRef)", async () => {
    const { client, getWs } = makeClient();
    await connect(client, getWs); // v1
    const cb = vi.fn();
    client.emit("room/topic", { a: 1 }, cb);
    expect(cb).toHaveBeenCalledWith(null);
    const sentPublish = getWs().sent.find((m) => m.type === "publish");
    expect(sentPublish.msgRef).toBeUndefined();
  });
});

describe("structured server errors", () => {
  it("emits NoLagServerError on the error event for unsolicited error frames", async () => {
    const { client, getWs } = makeClient();
    await connect(client, getWs);
    const errors: NoLagServerError[] = [];
    client.on("error", (e: any) => errors.push(e));

    getWs().receive({ type: "error", code: 42910, error: "rate_limit_exceeded", topic: "room/topic" });
    await new Promise((r) => setTimeout(r, 0));

    expect(errors[0]).toBeInstanceOf(NoLagServerError);
    expect(errors[0].code).toBe(42910);
    expect(errors[0].message).toContain("rate_limit_exceeded");
  });
});
