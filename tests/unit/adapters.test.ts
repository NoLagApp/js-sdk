import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { encode as msgpackEncode, decode as msgpackDecode } from "@msgpack/msgpack";
import { NoLag } from "../../src/client";
import type { AppLifecycleState, LifecycleAdapter, NetworkAdapter } from "../../src/adapters";

/**
 * Unit tests for the injectable platform adapters:
 *  - lifecycle drives disconnectOnHidden and the foreground token recheck
 *  - network reachability collapses reconnect backoff
 *  - both default to DOM implementations and can be opted out with null
 *  - destroy() releases the subscriptions that disconnect() deliberately keeps
 */

class MockWebSocket {
  readyState = 0;
  sent: any[] = [];
  onOpen: (() => void) | null = null;
  onMessage: ((data: ArrayBuffer | string) => void) | null = null;
  onClose: ((event: unknown) => void) | null = null;
  onError: ((err: Error) => void) | null = null;

  send(payload: ArrayBuffer) {
    this.sent.push(msgpackDecode(new Uint8Array(payload as any)));
  }
  close(code = 1000, reason = "closed") {
    this.readyState = 3;
    this.onClose?.({ code, reason });
  }
  open() {
    this.readyState = 1;
    this.onOpen?.();
  }
  receive(frame: object) {
    const buf = msgpackEncode(frame);
    this.onMessage?.(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    );
  }
  serverClose(code: number, reason: string) {
    this.readyState = 3;
    this.onClose?.({ code, reason });
  }
}

const b64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");

function makeJwt(claims: Record<string, unknown>): string {
  return `${b64url({ alg: "HS256", kid: "sk_live_abc" })}.${b64url(claims)}.sig`;
}

/** Controllable lifecycle adapter that records subscribe/unsubscribe. */
function fakeLifecycle() {
  const handlers: Array<(s: AppLifecycleState) => void> = [];
  let unsubscribes = 0;
  const adapter: LifecycleAdapter = {
    onStateChange(handler) {
      handlers.push(handler);
      return () => {
        unsubscribes++;
      };
    },
  };
  return {
    adapter,
    emit: (state: AppLifecycleState) => handlers.forEach((h) => h(state)),
    get subscriberCount() {
      return handlers.length;
    },
    get unsubscribeCount() {
      return unsubscribes;
    },
  };
}

/** Controllable network adapter that records subscribe/unsubscribe. */
function fakeNetwork() {
  const handlers: Array<(reachable: boolean) => void> = [];
  let unsubscribes = 0;
  const adapter: NetworkAdapter = {
    onReachabilityChange(handler) {
      handlers.push(handler);
      return () => {
        unsubscribes++;
      };
    },
  };
  return {
    adapter,
    emit: (reachable: boolean) => handlers.forEach((h) => h(reachable)),
    get subscriberCount() {
      return handlers.length;
    },
    get unsubscribeCount() {
      return unsubscribes;
    },
  };
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

async function completeAuth(ws: MockWebSocket) {
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
  });
  await tick();
}

async function connect(client: any, getWs: () => MockWebSocket) {
  const p = client.connect();
  await tick();
  await completeAuth(getWs());
  await p;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("lifecycle adapter", () => {
  it("subscribes to the injected adapter at construction", () => {
    const lifecycle = fakeLifecycle();
    makeClient("tok", { lifecycle: lifecycle.adapter });
    expect(lifecycle.subscriberCount).toBe(1);
  });

  it("disconnects on background when disconnectOnHidden is set", async () => {
    const lifecycle = fakeLifecycle();
    const { client, getWs } = makeClient("tok", {
      lifecycle: lifecycle.adapter,
      disconnectOnHidden: true,
    });

    await connect(client, getWs);
    expect(client.status).toBe("connected");

    lifecycle.emit("background");
    expect(client.status).toBe("disconnected");
  });

  it("stays connected on background when disconnectOnHidden is not set", async () => {
    const lifecycle = fakeLifecycle();
    const { client, getWs } = makeClient("tok", { lifecycle: lifecycle.adapter });

    await connect(client, getWs);
    lifecycle.emit("background");
    expect(client.status).toBe("connected");
  });

  it("reconnects on foreground after a disconnectOnHidden background", async () => {
    const lifecycle = fakeLifecycle();
    const { client, sockets, getWs } = makeClient("tok", {
      lifecycle: lifecycle.adapter,
      disconnectOnHidden: true,
    });

    await connect(client, getWs);
    lifecycle.emit("background");
    expect(client.status).toBe("disconnected");

    lifecycle.emit("active");
    await tick();
    await completeAuth(getWs());
    expect(client.status).toBe("connected");
    expect(sockets.length).toBe(2);
  });

  it("restores the configured reconnect flag that disconnect() cleared", async () => {
    // disconnect() flips _options.reconnect off. Without restoring it, a
    // backgrounded client loses auto-reconnect permanently, which on mobile
    // means after the first background it never recovers from a dropped socket.
    const lifecycle = fakeLifecycle();
    const { client, getWs } = makeClient("tok", {
      lifecycle: lifecycle.adapter,
      disconnectOnHidden: true,
      reconnect: true,
      reconnectInterval: 1000,
    });

    await connect(client, getWs);
    lifecycle.emit("background");
    lifecycle.emit("active");
    await tick();
    await completeAuth(getWs());
    expect(client.status).toBe("connected");

    // Now drop the socket from the server side: auto-reconnect must still work.
    getWs().serverClose(1006, "network");
    await tick();
    expect(client.status).toBe("reconnecting");
  });

  it("does not resume a client the caller disconnected by hand", async () => {
    const lifecycle = fakeLifecycle();
    const { client, sockets, getWs } = makeClient("tok", {
      lifecycle: lifecycle.adapter,
    });

    await connect(client, getWs);
    client.disconnect();
    expect(client.status).toBe("disconnected");

    lifecycle.emit("active");
    await tick();
    // disconnectOnHidden is off, so foreground must not reopen the socket.
    expect(sockets.length).toBe(1);
    expect(client.status).toBe("disconnected");
  });

  it("refreshes a token that expired while backgrounded", async () => {
    // Timers do not fire reliably while suspended, so the scheduled refresh
    // may never have run and the held token can already be dead.
    const provider = vi
      .fn()
      .mockResolvedValueOnce(makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }))
      .mockResolvedValue(makeJwt({ exp: Math.floor(Date.now() / 1000) + 7200 }));
    const lifecycle = fakeLifecycle();
    const { client, getWs } = makeClient(provider, { lifecycle: lifecycle.adapter });

    await connect(client, getWs);
    expect(provider).toHaveBeenCalledTimes(1);

    // Jump past expiry without letting the refresh timer run.
    vi.setSystemTime(Date.now() + 3_600_000);

    lifecycle.emit("active");
    await tick();
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("leaves a still-valid token alone on foreground", async () => {
    const provider = vi
      .fn()
      .mockResolvedValue(makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    const lifecycle = fakeLifecycle();
    const { client, getWs } = makeClient(provider, { lifecycle: lifecycle.adapter });

    await connect(client, getWs);
    lifecycle.emit("active");
    await tick();
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("takes no lifecycle subscription when passed null", () => {
    const lifecycle = fakeLifecycle();
    makeClient("tok", { lifecycle: null });
    expect(lifecycle.subscriberCount).toBe(0);
  });
});

describe("network adapter", () => {
  it("collapses reconnect backoff when the network returns", async () => {
    const network = fakeNetwork();
    const { client, sockets, getWs } = makeClient("tok", {
      network: network.adapter,
      reconnect: true,
      reconnectInterval: 30_000,
    });

    await connect(client, getWs);
    getWs().serverClose(1006, "network lost");
    await tick();
    expect(client.status).toBe("reconnecting");
    expect(sockets.length).toBe(1);

    // Without the signal we would sit in backoff; with it we retry now.
    network.emit(true);
    await tick();
    expect(sockets.length).toBe(2);
  });

  it("resets the attempt counter so backoff starts fresh", async () => {
    const network = fakeNetwork();
    const { client, getWs } = makeClient("tok", {
      network: network.adapter,
      reconnect: true,
      reconnectInterval: 1000,
    });

    await connect(client, getWs);
    getWs().serverClose(1006, "lost");
    await tick();

    network.emit(true);
    await tick();
    expect((client as any)._reconnectAttempts).toBe(0);
  });

  it("ignores reachability while connected", async () => {
    const network = fakeNetwork();
    const { client, sockets, getWs } = makeClient("tok", { network: network.adapter });

    await connect(client, getWs);
    network.emit(true);
    await tick();
    expect(sockets.length).toBe(1);
    expect(client.status).toBe("connected");
  });

  it("does not resurrect a client the caller disconnected", async () => {
    const network = fakeNetwork();
    const { client, sockets, getWs } = makeClient("tok", { network: network.adapter });

    await connect(client, getWs);
    client.disconnect();
    network.emit(true);
    await tick();
    expect(sockets.length).toBe(1);
    expect(client.status).toBe("disconnected");
  });

  it("takes no network subscription when passed null", () => {
    const network = fakeNetwork();
    makeClient("tok", { network: null });
    expect(network.subscriberCount).toBe(0);
  });
});

describe("destroy", () => {
  it("releases adapter subscriptions that disconnect() keeps", async () => {
    const lifecycle = fakeLifecycle();
    const network = fakeNetwork();
    const { client, getWs } = makeClient("tok", {
      lifecycle: lifecycle.adapter,
      network: network.adapter,
    });

    await connect(client, getWs);

    // disconnect() must keep them: a backgrounded client has to come back.
    client.disconnect();
    expect(lifecycle.unsubscribeCount).toBe(0);
    expect(network.unsubscribeCount).toBe(0);

    client.destroy();
    expect(lifecycle.unsubscribeCount).toBe(1);
    expect(network.unsubscribeCount).toBe(1);
    expect(client.status).toBe("disconnected");
  });

  it("is safe to call twice", async () => {
    const lifecycle = fakeLifecycle();
    const { client, getWs } = makeClient("tok", { lifecycle: lifecycle.adapter });
    await connect(client, getWs);

    client.destroy();
    expect(() => client.destroy()).not.toThrow();
    expect(lifecycle.unsubscribeCount).toBe(1);
  });
});

describe("DOM defaults", () => {
  it("uses document visibility when no adapter is injected", async () => {
    const listeners: Record<string, Array<() => void>> = {};
    const doc = {
      visibilityState: "visible",
      addEventListener: (evt: string, fn: () => void) => {
        (listeners[evt] ||= []).push(fn);
      },
      removeEventListener: vi.fn(),
    };
    (globalThis as any).document = doc;

    try {
      const { client, getWs } = makeClient("tok", { disconnectOnHidden: true });
      await connect(client, getWs);

      doc.visibilityState = "hidden";
      listeners["visibilitychange"].forEach((fn) => fn());
      expect(client.status).toBe("disconnected");
    } finally {
      delete (globalThis as any).document;
    }
  });

  it("constructs without a document or window present", () => {
    // Node and React Native both land here.
    expect((globalThis as any).document).toBeUndefined();
    expect(() => makeClient("tok", { disconnectOnHidden: true })).not.toThrow();
  });
});
