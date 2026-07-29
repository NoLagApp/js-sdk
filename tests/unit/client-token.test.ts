import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { encode as msgpackEncode, decode as msgpackDecode } from "@msgpack/msgpack";
import { NoLag } from "../../src/client";

/**
 * Unit tests for client-token (browser JWT) support:
 *  - TokenProvider is invoked on every connect and reconnect
 *  - JWT exp decoding (no crypto, base64url payload only)
 *  - proactive refresh-reconnect at exp - 30s via the normal reconnect flow
 *  - immediate reconnect on server 4003 (token_expired) close
 *  - static string tokens take none of the new code paths
 */

class MockWebSocket {
  readyState = 0; // CONNECTING
  sent: any[] = [];
  closedWith: { code?: number; reason?: string } | null = null;
  onOpen: (() => void) | null = null;
  onMessage: ((data: ArrayBuffer | string) => void) | null = null;
  onClose: ((event: unknown) => void) | null = null;
  onError: ((err: Error) => void) | null = null;

  send(payload: ArrayBuffer) {
    this.sent.push(msgpackDecode(new Uint8Array(payload as any)));
  }
  close(code = 1000, reason = "closed") {
    this.readyState = 3;
    this.closedWith = { code, reason };
    this.onClose?.({ code, reason });
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
  serverClose(code: number, reason: string) {
    this.readyState = 3;
    this.onClose?.({ code, reason });
  }
}

const b64url = (obj: object) =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");

/** Unsigned-but-well-formed JWT; the SDK never verifies signatures. */
function makeJwt(claims: Record<string, unknown>): string {
  return `${b64url({ alg: "HS256", kid: "sk_live_abc123def456" })}.${b64url(claims)}.sig`;
}

function makeClient(token: any, opts: Record<string, unknown> = {}) {
  const sockets: MockWebSocket[] = [];
  const factory = () => {
    const ws = new MockWebSocket();
    sockets.push(ws);
    return ws as any;
  };
  const client = new NoLag(factory as any, token, {
    heartbeatInterval: 0,
    ...opts,
  } as any);
  return { client, sockets, getWs: () => sockets[sockets.length - 1] };
}

async function tick() {
  await vi.advanceTimersByTimeAsync(0);
}

async function completeAuth(ws: MockWebSocket, authExtra: Record<string, unknown> = {}) {
  ws.open();
  await tick();
  ws.receive({
    type: "auth",
    success: true,
    actorTokenId: "actor-1",
    projectId: "proj-1",
    actorType: "user",
    protocolVersion: 2,
    restoredSubscriptions: [],
    ...authExtra,
  });
  await tick();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("token provider", () => {
  it("invokes the provider on connect and sends the resolved token", async () => {
    const provider = vi.fn().mockResolvedValue("provided-token");
    const { client, getWs } = makeClient(provider, { reconnect: false });

    const p = client.connect();
    await tick();
    await completeAuth(getWs());
    await p;

    expect(provider).toHaveBeenCalledTimes(1);
    const authMsg = getWs().sent.find((m) => m.type === "auth");
    expect(authMsg.token).toBe("provided-token");
  });

  it("supports synchronous providers", async () => {
    const provider = vi.fn().mockReturnValue("sync-token");
    const { client, getWs } = makeClient(provider, { reconnect: false });

    const p = client.connect();
    await tick();
    await completeAuth(getWs());
    await p;

    const authMsg = getWs().sent.find((m) => m.type === "auth");
    expect(authMsg.token).toBe("sync-token");
  });

  it("rejects connect() when the provider throws", async () => {
    const provider = vi.fn().mockRejectedValue(new Error("mint failed"));
    const { client, getWs } = makeClient(provider, { reconnect: false });

    const p = client.connect();
    await tick();
    getWs().open();

    await expect(p).rejects.toThrow("mint failed");
  });

  it("invokes the provider again on reconnect for a fresh token", async () => {
    let calls = 0;
    const provider = vi.fn(() => `token-${++calls}`);
    const { client, sockets, getWs } = makeClient(provider, {
      reconnect: true,
      reconnectInterval: 1000,
    });

    const p = client.connect();
    await tick();
    await completeAuth(getWs());
    await p;

    // Drop the connection; backoff reconnect kicks in
    getWs().serverClose(1006, "gone");
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets.length).toBe(2);
    await completeAuth(getWs());

    expect(provider).toHaveBeenCalledTimes(2);
    const authMsg = getWs().sent.find((m) => m.type === "auth");
    expect(authMsg.token).toBe("token-2");
    expect(authMsg.reconnect).toBe(true);
  });
});

describe("JWT exp decoding", () => {
  it("decodes exp from a well-formed JWT", () => {
    const { client } = makeClient("unused", { reconnect: false });
    const exp = 1767225600;
    expect((client as any)._decodeJwtExp(makeJwt({ sub: "at_live_x", exp }))).toBe(exp);
  });

  it("returns null for opaque tokens and malformed input", () => {
    const { client } = makeClient("unused", { reconnect: false });
    expect((client as any)._decodeJwtExp("at_live_abc.secret")).toBeNull();
    expect((client as any)._decodeJwtExp("eyJ.not-base64.sig")).toBeNull();
    expect((client as any)._decodeJwtExp(makeJwt({ sub: "no-exp" }))).toBeNull();
  });
});

describe("proactive refresh", () => {
  it("refreshes in-band at exp - 30s without dropping the socket", async () => {
    let calls = 0;
    const provider = vi.fn(() =>
      makeJwt({ sub: "at_live_x", exp: Math.floor(Date.now() / 1000) + 120, n: ++calls })
    );
    const { client, sockets, getWs } = makeClient(provider, { reconnect: true });
    const disconnects: unknown[] = [];
    client.on("disconnect", (reason: unknown) => disconnects.push(reason));

    const p = client.connect();
    await tick();
    await completeAuth(getWs());
    await p;
    expect(provider).toHaveBeenCalledTimes(1);

    // Refresh timer fires at exp - 30s = +90s and sends a reauth frame
    await vi.advanceTimersByTimeAsync(90_000);
    expect(provider).toHaveBeenCalledTimes(2);
    const reauthMsg = getWs().sent.find((m) => m.type === "reauth");
    expect(reauthMsg).toBeTruthy();
    expect(typeof reauthMsg.token).toBe("string");

    // Broker accepts: same socket, no close, no disconnect event
    getWs().receive({ type: "reauth", success: true });
    await tick();
    expect(sockets.length).toBe(1);
    expect(sockets[0].closedWith).toBeNull();
    expect(disconnects).toEqual([]);
    expect(client.connected).toBe(true);

    // The cycle re-arms: another refresh fires ~90s later
    await vi.advanceTimersByTimeAsync(90_000);
    expect(provider).toHaveBeenCalledTimes(3);
    expect(getWs().sent.filter((m) => m.type === "reauth").length).toBe(2);
  });

  it("falls back to reconnect when the broker rejects reauth", async () => {
    let calls = 0;
    const provider = vi.fn(() =>
      makeJwt({ sub: "at_live_x", exp: Math.floor(Date.now() / 1000) + 120, n: ++calls })
    );
    const { client, sockets, getWs } = makeClient(provider, { reconnect: true });

    const p = client.connect();
    await tick();
    await completeAuth(getWs());
    await p;

    await vi.advanceTimersByTimeAsync(90_000);
    getWs().receive({ type: "reauth", success: false, error: "token_invalid" });
    await tick();

    // Reconnect fallback: socket closed for refresh, new socket, reconnect flag
    expect(sockets[0].closedWith?.reason).toBe("token_refresh");
    expect(sockets.length).toBe(2);
    await completeAuth(getWs());
    const authMsg = getWs().sent.find((m) => m.type === "auth");
    expect(authMsg.reconnect).toBe(true);
    expect(client.connected).toBe(true);
  });

  it("falls back to reconnect when the broker never answers (old broker)", async () => {
    let calls = 0;
    const provider = vi.fn(() =>
      makeJwt({ sub: "at_live_x", exp: Math.floor(Date.now() / 1000) + 120, n: ++calls })
    );
    const { client, sockets, getWs } = makeClient(provider, { reconnect: true });

    const p = client.connect();
    await tick();
    await completeAuth(getWs());
    await p;

    await vi.advanceTimersByTimeAsync(90_000);
    expect(getWs().sent.find((m) => m.type === "reauth")).toBeTruthy();

    // No response: the 10s reauth timeout fires, then reconnect fallback
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sockets[0].closedWith?.reason).toBe("token_refresh");
    expect(sockets.length).toBe(2);
    await completeAuth(getWs());
    expect(client.connected).toBe(true);
  });

  it("does not schedule a refresh for static string tokens", async () => {
    const jwt = makeJwt({ sub: "at_live_x", exp: Math.floor(Date.now() / 1000) + 120 });
    const { client, sockets, getWs } = makeClient(jwt, { reconnect: true });

    const p = client.connect();
    await tick();
    await completeAuth(getWs());
    await p;

    await vi.advanceTimersByTimeAsync(300_000);
    expect(sockets.length).toBe(1);
    expect(sockets[0].closedWith).toBeNull();
  });

  it("does not schedule a refresh for opaque provider tokens", async () => {
    const provider = vi.fn().mockResolvedValue("at_live_abc.secret");
    const { client, sockets, getWs } = makeClient(provider, { reconnect: true });

    const p = client.connect();
    await tick();
    await completeAuth(getWs());
    await p;

    await vi.advanceTimersByTimeAsync(600_000);
    expect(sockets.length).toBe(1);
    expect(sockets[0].closedWith).toBeNull();
  });
});

describe("4003 token_expired close", () => {
  it("emits disconnect and reconnects immediately with a fresh token", async () => {
    let calls = 0;
    const provider = vi.fn(() => `token-${++calls}`);
    const { client, sockets, getWs } = makeClient(provider, { reconnect: true });
    const disconnects: unknown[] = [];
    client.on("disconnect", (reason: unknown) => disconnects.push(reason));

    const p = client.connect();
    await tick();
    await completeAuth(getWs());
    await p;

    getWs().serverClose(4003, "token_expired");
    await tick();

    expect(disconnects).toEqual(["token_expired"]);
    // Immediate reconnect (no backoff timer needed)
    expect(sockets.length).toBe(2);
    await completeAuth(getWs());

    expect(provider).toHaveBeenCalledTimes(2);
    const authMsg = getWs().sent.find((m) => m.type === "auth");
    expect(authMsg.token).toBe("token-2");
    expect(authMsg.reconnect).toBe(true);
    expect(client.connected).toBe(true);
  });

  it("respects reconnect: false on 4003", async () => {
    const provider = vi.fn().mockResolvedValue("token");
    const { client, sockets, getWs } = makeClient(provider, { reconnect: false });

    const p = client.connect();
    await tick();
    await completeAuth(getWs());
    await p;

    getWs().serverClose(4003, "token_expired");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sockets.length).toBe(1);
    expect(client.connected).toBe(false);
  });
});
