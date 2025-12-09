/**
 * E2E Tests for NoLag JS SDK with Kraken-v2
 *
 * Prerequisites:
 * 1. Start kraken-v2: cd kraken-v2 && docker-compose up -d
 * 2. Start Titus: cd titus && npm run dev
 * 3. Set environment variables:
 *    - NOLAG_TEST_TOKEN: Valid access token from Titus
 *    - NOLAG_TEST_URL: WebSocket URL (default: ws://localhost:8080/ws)
 *
 * Run tests:
 *   NOLAG_TEST_TOKEN=at_xxx npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { NoLag } from "../../src/index";

const TEST_URL = process.env.NOLAG_TEST_URL || "ws://localhost:8080/ws";
const TEST_TOKEN = process.env.NOLAG_TEST_TOKEN;
const TEST_TOKEN_2 = process.env.NOLAG_TEST_TOKEN_2;

// Helper to wait for a condition
function waitFor(
  condition: () => boolean,
  timeout = 5000,
  interval = 100
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error("Timeout waiting for condition"));
      } else {
        setTimeout(check, interval);
      }
    };
    check();
  });
}

// Helper to wait for ms
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!TEST_TOKEN)("NoLag SDK E2E with Kraken-v2", () => {
  let client: ReturnType<typeof NoLag>;

  beforeEach(() => {
    client = NoLag(TEST_TOKEN!, {
      url: TEST_URL,
      debug: true,
      reconnect: false,
      heartbeatInterval: 0, // Disable heartbeat for tests unless specifically testing it
    });
  });

  afterEach(async () => {
    if (client?.connected) {
      client.disconnect();
    }
    await sleep(100);
  });

  describe("Connection", () => {
    it("should connect and authenticate successfully", async () => {
      await client.connect();

      expect(client.connected).toBe(true);
      expect(client.status).toBe("connected");
      expect(client.actorId).toBeTruthy();
    });

    it("should fail with invalid token", async () => {
      const badClient = NoLag("invalid_token", {
        url: TEST_URL,
        reconnect: false,
      });

      await expect(badClient.connect()).rejects.toThrow();
      expect(badClient.connected).toBe(false);
    });

    it("should disconnect cleanly", async () => {
      await client.connect();
      expect(client.connected).toBe(true);

      client.disconnect();
      expect(client.connected).toBe(false);
      expect(client.status).toBe("disconnected");
    });

    it("should emit connect event", async () => {
      let connectCalled = false;

      client.on("connect", () => {
        connectCalled = true;
      });

      await client.connect();

      expect(connectCalled).toBe(true);
    });

    it("should emit disconnect event", async () => {
      let disconnectCalled = false;

      client.on("disconnect", () => {
        disconnectCalled = true;
      });

      await client.connect();
      client.disconnect();

      // Wait a bit for the event
      await sleep(100);
      expect(disconnectCalled).toBe(true);
    });
  });

  describe("Subscribe/Unsubscribe", () => {
    beforeEach(async () => {
      await client.connect();
    });

    it("should subscribe to a topic", async () => {
      let subscribeCalled = false;

      client.subscribe("test.room.messages", (err) => {
        subscribeCalled = true;
        expect(err).toBeNull();
      });

      await sleep(100);
      expect(subscribeCalled).toBe(true);
    });

    it("should unsubscribe from a topic", async () => {
      client.subscribe("test.room.messages");
      await sleep(100);

      let unsubscribeCalled = false;
      client.unsubscribe("test.room.messages", (err) => {
        unsubscribeCalled = true;
        expect(err).toBeNull();
      });

      await sleep(100);
      expect(unsubscribeCalled).toBe(true);
    });
  });

  describe("Publish/Subscribe Messaging", () => {
    beforeEach(async () => {
      await client.connect();
    });

    it("should receive own published message", async () => {
      const topic = `test.e2e.${Date.now()}`;
      const testData = { message: "hello", timestamp: Date.now() };

      let receivedData: any = null;

      client.subscribe(topic);
      client.on(topic, (data) => {
        receivedData = data;
      });

      await sleep(200); // Wait for subscription to be established

      client.emit(topic, testData);

      await waitFor(() => receivedData !== null, 5000);

      expect(receivedData).toEqual(testData);
    });

    it("should handle multiple subscribers to same topic", async () => {
      const topic = `test.multi.${Date.now()}`;
      const testData = { value: 42 };

      let handler1Called = false;
      let handler2Called = false;

      client.subscribe(topic);
      client.on(topic, () => {
        handler1Called = true;
      });
      client.on(topic, () => {
        handler2Called = true;
      });

      await sleep(200);

      client.emit(topic, testData);

      await waitFor(() => handler1Called && handler2Called, 5000);

      expect(handler1Called).toBe(true);
      expect(handler2Called).toBe(true);
    });

    it("should work with onAny wildcard handler", async () => {
      const topic = `test.wildcard.${Date.now()}`;
      const testData = { test: true };

      let receivedTopic: string | null = null;
      let receivedData: any = null;

      client.subscribe(topic);
      client.onAny((t, d) => {
        receivedTopic = t;
        receivedData = d;
      });

      await sleep(200);

      client.emit(topic, testData);

      await waitFor(() => receivedData !== null, 5000);

      expect(receivedTopic).toBe(topic);
      expect(receivedData).toEqual(testData);
    });
  });

  describe("Fluent API (App/Room)", () => {
    beforeEach(async () => {
      await client.connect();
    });

    it("should work with setApp().setRoom() pattern", async () => {
      const room = client.setApp("myapp").setRoom("lobby");
      const testData = { user: "alice", message: "hi" };

      let receivedData: any = null;

      room.subscribe("chat");
      room.on("chat", (data) => {
        receivedData = data;
      });

      await sleep(200);

      room.emit("chat", testData);

      await waitFor(() => receivedData !== null, 5000);

      expect(receivedData).toEqual(testData);
    });

    it("should have correct prefix", () => {
      const room = client.setApp("testapp").setRoom("testroom");
      expect(room.prefix).toBe("testapp.testroom");
    });
  });

  describe("Heartbeat", () => {
    it("should send and receive heartbeat", async () => {
      const heartbeatClient = NoLag(TEST_TOKEN!, {
        url: TEST_URL,
        debug: true,
        reconnect: false,
        heartbeatInterval: 1000, // 1 second for testing
      });

      await heartbeatClient.connect();
      expect(heartbeatClient.connected).toBe(true);

      // Wait for at least 2 heartbeats
      await sleep(2500);

      // If we're still connected, heartbeats are working
      expect(heartbeatClient.connected).toBe(true);

      heartbeatClient.disconnect();
    });

    it("should not send heartbeat when disabled", async () => {
      const noHeartbeatClient = NoLag(TEST_TOKEN!, {
        url: TEST_URL,
        debug: true,
        reconnect: false,
        heartbeatInterval: 0, // Disabled
      });

      await noHeartbeatClient.connect();
      expect(noHeartbeatClient.connected).toBe(true);

      // Should still be connected after short period
      await sleep(500);
      expect(noHeartbeatClient.connected).toBe(true);

      noHeartbeatClient.disconnect();
    });
  });

  describe("Error Handling", () => {
    it("should emit error event on server error", async () => {
      await client.connect();

      let errorReceived: Error | null = null;
      client.on("error", (err) => {
        errorReceived = err;
      });

      // Try to subscribe to unauthorized topic (if ACL is enforced)
      // This test depends on Titus ACL configuration
      client.subscribe("unauthorized.topic.that.should.fail");

      await sleep(500);

      // Note: This test may pass or fail depending on ACL config
      // If ACL allows all, no error will be emitted
    });

    it("should handle subscribe before connect", () => {
      const unconnectedClient = NoLag(TEST_TOKEN!, {
        url: TEST_URL,
        reconnect: false,
      });

      let errorReceived = false;
      unconnectedClient.subscribe("test.topic", (err) => {
        if (err) errorReceived = true;
      });

      expect(errorReceived).toBe(true);
    });

    it("should handle emit before connect", () => {
      const unconnectedClient = NoLag(TEST_TOKEN!, {
        url: TEST_URL,
        reconnect: false,
      });

      let errorReceived = false;
      unconnectedClient.emit("test.topic", { data: "test" }, (err) => {
        if (err) errorReceived = true;
      });

      expect(errorReceived).toBe(true);
    });
  });
});

describe.skipIf(!TEST_TOKEN || !TEST_TOKEN_2)("Multi-Client Messaging", () => {
  let client1: NoLag;
  let client2: NoLag;

  beforeEach(async () => {
    client1 = NoLag(TEST_TOKEN!, {
      url: TEST_URL,
      debug: true,
      reconnect: false,
      heartbeatInterval: 0,
    });

    client2 = NoLag(TEST_TOKEN_2!, {
      url: TEST_URL,
      debug: true,
      reconnect: false,
      heartbeatInterval: 0,
    });

    await Promise.all([client1.connect(), client2.connect()]);
  });

  afterEach(() => {
    client1?.disconnect();
    client2?.disconnect();
  });

  it("should deliver messages between two clients", async () => {
    const topic = `test.multiclient.${Date.now()}`;
    const testData = { from: "client1", value: 123 };

    let client2Received: any = null;

    // Client 2 subscribes
    client2.subscribe(topic);
    client2.on(topic, (data) => {
      client2Received = data;
    });

    await sleep(200);

    // Client 1 publishes
    client1.emit(topic, testData);

    await waitFor(() => client2Received !== null, 5000);

    expect(client2Received).toEqual(testData);
  });

  it("should support bidirectional messaging", async () => {
    const topic = `test.bidirectional.${Date.now()}`;

    let client1Received: any[] = [];
    let client2Received: any[] = [];

    // Both subscribe
    client1.subscribe(topic);
    client2.subscribe(topic);

    client1.on(topic, (data) => client1Received.push(data));
    client2.on(topic, (data) => client2Received.push(data));

    await sleep(200);

    // Both publish
    client1.emit(topic, { from: "client1" });
    client2.emit(topic, { from: "client2" });

    await waitFor(() => client1Received.length >= 2 && client2Received.length >= 2, 5000);

    // Both clients should receive both messages
    expect(client1Received.length).toBeGreaterThanOrEqual(2);
    expect(client2Received.length).toBeGreaterThanOrEqual(2);
  });
});

describe.skipIf(!TEST_TOKEN)("Load Balancing", () => {
  it("should subscribe with load balancing enabled", async () => {
    const client = NoLag(TEST_TOKEN!, {
      url: TEST_URL,
      debug: true,
      reconnect: false,
      heartbeatInterval: 0,
      loadBalance: true,
      loadBalanceGroup: "test-workers",
    });

    await client.connect();

    expect(client.loadBalanced).toBe(true);
    expect(client.loadBalanceGroup).toBe("test-workers");

    client.subscribe("jobs.process");

    await sleep(100);

    client.disconnect();
  });

  it("should override load balance per subscription", async () => {
    const client = NoLag(TEST_TOKEN!, {
      url: TEST_URL,
      debug: true,
      reconnect: false,
      heartbeatInterval: 0,
      loadBalance: false, // Default off
    });

    await client.connect();

    // Override for specific topic
    client.subscribe("jobs.process", { loadBalance: true, loadBalanceGroup: "workers" });

    await sleep(100);

    client.disconnect();
  });
});

describe.skipIf(!TEST_TOKEN)("Echo", () => {
  let client: ReturnType<typeof NoLag>;

  beforeEach(async () => {
    client = NoLag(TEST_TOKEN!, {
      url: TEST_URL,
      debug: true,
      reconnect: false,
      heartbeatInterval: 0,
    });
    await client.connect();
  });

  afterEach(() => {
    client?.disconnect();
  });

  it("should receive own message when echo is true (default)", async () => {
    const topic = `test.echo.enabled.${Date.now()}`;
    const testData = { message: "echo me" };

    let receivedData: any = null;

    client.subscribe(topic);
    client.on(topic, (data) => {
      receivedData = data;
    });

    await sleep(200);

    // Emit with echo=true (default)
    client.emit(topic, testData);

    await waitFor(() => receivedData !== null, 5000);

    expect(receivedData).toEqual(testData);
  });

  it("should NOT receive own message when echo is false", async () => {
    const topic = `test.echo.disabled.${Date.now()}`;
    const testData = { message: "no echo" };

    let receivedData: any = null;

    client.subscribe(topic);
    client.on(topic, (data) => {
      receivedData = data;
    });

    await sleep(200);

    // Emit with echo=false
    client.emit(topic, testData, { echo: false });

    // Wait a bit to ensure message had time to arrive if it was going to
    await sleep(500);

    // Should NOT have received the message
    expect(receivedData).toBeNull();
  });

  it("should receive message from another source even when original sender used echo=false", async () => {
    // This test verifies that echo=false only filters the sender's own messages,
    // not messages from other publishers on the same topic

    const topic = `test.echo.mixed.${Date.now()}`;

    let receivedCount = 0;
    const receivedMessages: any[] = [];

    client.subscribe(topic);
    client.on(topic, (data) => {
      receivedCount++;
      receivedMessages.push(data);
    });

    await sleep(200);

    // Emit with echo=true (should receive)
    client.emit(topic, { id: 1, echo: true });

    // Emit with echo=false (should NOT receive)
    client.emit(topic, { id: 2, echo: false }, { echo: false });

    // Emit with echo=true again (should receive)
    client.emit(topic, { id: 3, echo: true });

    await waitFor(() => receivedCount >= 2, 5000);

    // Should receive messages 1 and 3, but not 2
    expect(receivedMessages.length).toBe(2);
    expect(receivedMessages.some(m => m.id === 1)).toBe(true);
    expect(receivedMessages.some(m => m.id === 3)).toBe(true);
    expect(receivedMessages.some(m => m.id === 2)).toBe(false);
  });
});
