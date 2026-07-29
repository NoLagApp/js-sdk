/**
 * E2E: client tokens (browser JWTs) + in-band reauth against a real broker.
 *
 * Exercises the full path a browser app takes: the backend mints short-lived
 * HS256 JWTs from a project signing key, the SDK connects with a token
 * provider, and the token is refreshed OVER the live connection (reauth) with
 * no disconnect.
 *
 * Prerequisites (env, e.g. in .env.test):
 *   NOLAG_API_KEY      Project API key (nlg_live_...) — creates the test actor
 *   NOLAG_SIGNING_KEY  Signing key (sk_live_<kid>.<secret>) in the SAME project
 *   NOLAG_TEST_URL     Broker WS URL (default wss://broker.nolag.app/ws)
 *
 * Run: npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHmac } from "crypto";
import { NoLag } from "../../src/index";
import { NoLagApi } from "../../src/api";

const TEST_URL = process.env.NOLAG_TEST_URL || "wss://broker.nolag.app/ws";
const API_KEY = process.env.NOLAG_API_KEY;
const SIGNING_KEY = process.env.NOLAG_SIGNING_KEY;

const haveCreds = !!API_KEY && !!SIGNING_KEY;

/** Dependency-free HS256 JWT signer (what a customer backend would do). */
function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}
function signJwt(
  claims: Record<string, unknown>,
  signingKey: string,
): string {
  const [kid, secret] = signingKey.split(".");
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT", kid }));
  const payload = base64url(JSON.stringify(claims));
  const data = `${header}.${payload}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

const nowSec = () => Math.floor(Date.now() / 1000);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe.skipIf(!haveCreds)("client tokens + in-band reauth (E2E)", () => {
  let api: NoLagApi;
  let actorKeyId: string;
  let actorTokenId: string;

  const mint = (ttlSec = 900): string =>
    signJwt({ sub: actorKeyId, iat: nowSec(), exp: nowSec() + ttlSec }, SIGNING_KEY!);

  beforeAll(async () => {
    api = new NoLagApi(API_KEY!);
    // A throwaway actor in the signing key's project. We keep only its public
    // keyId (a browser-flow actor never needs its secret).
    const actor = await api.actors.create({
      name: `e2e-client-token-${Date.now()}`,
      actorType: "user",
    });
    actorKeyId = actor.keyId;
    actorTokenId = actor.actorTokenId;
  }, 30000);

  afterAll(async () => {
    if (actorKeyId) {
      // Management routes accept the public keyId.
      await api.request("DELETE", `/actors/${actorKeyId}`).catch(() => {});
    }
  });

  it("connects with a token provider and authenticates as the actor", async () => {
    let calls = 0;
    const client = NoLag(
      () => {
        calls++;
        return mint();
      },
      { url: TEST_URL, reconnect: false },
    );

    await client.connect();
    expect(client.connected).toBe(true);
    expect(client.actorId).toBe(actorTokenId);
    expect(calls).toBe(1); // provider invoked once for the connect
    client.disconnect();
  });

  it("rejects an expired client token", async () => {
    const expired = signJwt(
      { sub: actorKeyId, iat: nowSec() - 600, exp: nowSec() - 300 },
      SIGNING_KEY!,
    );
    const client = NoLag(expired, { url: TEST_URL, reconnect: false });
    await expect(client.connect()).rejects.toBeTruthy();
    expect(client.connected).toBe(false);
  });

  it("refreshes the token in-band with no disconnect (reauth)", async () => {
    const client = NoLag(() => mint(900), { url: TEST_URL, reconnect: false });
    const disconnects: unknown[] = [];
    client.on("disconnect", (reason: unknown) => disconnects.push(reason));

    await client.connect();
    expect(client.connected).toBe(true);

    // Send a reauth frame with a freshly minted token — the broker should
    // extend the session on the SAME socket (no close, no reconnect).
    const fresh = mint(900);
    const ok = await (client as unknown as {
      _sendReauth(t: string): Promise<boolean>;
    })._sendReauth(fresh);

    expect(ok).toBe(true);
    // Give any (unexpected) close a moment to surface.
    await sleep(300);
    expect(client.connected).toBe(true);
    expect(disconnects).toEqual([]);

    client.disconnect();
  });

  it("rejects a reauth whose token names a different actor", async () => {
    const client = NoLag(() => mint(900), { url: TEST_URL, reconnect: false });
    await client.connect();

    // A validly-signed token for a DIFFERENT (nonexistent) actor keyId — the
    // broker's identity pinning must refuse it and keep the current session.
    const foreign = signJwt(
      { sub: "at_live_000000000000", iat: nowSec(), exp: nowSec() + 900 },
      SIGNING_KEY!,
    );
    const ok = await (client as unknown as {
      _sendReauth(t: string): Promise<boolean>;
    })._sendReauth(foreign);

    expect(ok).toBe(false);
    expect(client.connected).toBe(true); // session preserved
    client.disconnect();
  });
});
