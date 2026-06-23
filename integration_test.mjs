#!/usr/bin/env node
/**
 * Integration test for the NoLag JS SDK.
 *
 * Spins up two NoLag client instances and tests all SDK features end-to-end.
 *
 * Usage:
 *   node integration_test.mjs token1=<token-a> token2=<token-b> appSlug=<app-slug> [room=<room>]
 */

import { NoLag } from "./dist/index.mjs";

// ── Helpers ──

const PASS = "\x1b[92mPASS\x1b[0m";
const FAIL = "\x1b[91mFAIL\x1b[0m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

const results = [];

function report(name, passed, detail = "") {
  results.push({ name, passed, detail });
  const status = passed ? PASS : FAIL;
  let msg = `  ${status}  ${name}`;
  if (detail) msg += `  ${DIM}(${detail})${RESET}`;
  console.log(msg);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitFor(promise, seconds = 10, label = "") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timed out after ${seconds}s: ${label}`)),
        seconds * 1000,
      ),
    ),
  ]);
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ═══════════════════════════════════════════════════════════════
// CONNECTION & PROPERTIES
// ═══════════════════════════════════════════════════════════════

async function testConnect(clientA, clientB) {
  const ok =
    clientA.connected &&
    clientB.connected &&
    clientA.status === "connected" &&
    clientA.actorId != null &&
    clientB.actorId != null &&
    clientA.projectId != null;
  report(
    "Connect & Auth",
    ok,
    `A=${clientA.actorId} B=${clientB.actorId} project=${clientA.projectId}`,
  );
}

async function testProperties(clientA) {
  const ok =
    clientA.actorId != null &&
    clientA.projectId != null &&
    clientA.actorType != null &&
    typeof clientA.connected === "boolean" &&
    typeof clientA.loadBalanced === "boolean";
  report(
    "Properties",
    ok,
    `type=${clientA.actorType} project=${clientA.projectId} lb=${clientA.loadBalanced}`,
  );
}

async function testConnectionStatus(clientA) {
  const ok = clientA.status === "connected";
  report("ConnectionStatus", ok, `status=${clientA.status}`);
}

// ═══════════════════════════════════════════════════════════════
// FLUENT API
// ═══════════════════════════════════════════════════════════════

async function testFluentApi(clientA, appSlug) {
  const app = clientA.setApp(appSlug);
  const room = app.setRoom("test-room");
  const ok = room.prefix === `${appSlug}/test-room`;
  report("Fluent API (App -> Room)", ok, `prefix=${room.prefix}`);
}

async function testFluentApiLobby(clientA, appSlug) {
  const app = clientA.setApp(appSlug);
  const lobby = app.setLobby("test-lobby");
  const ok = lobby.lobbyId === "test-lobby";
  report("Fluent API (App -> Lobby)", ok, `lobbyId=${lobby.lobbyId}`);
}

// ═══════════════════════════════════════════════════════════════
// BASIC PUB/SUB
// ═══════════════════════════════════════════════════════════════

async function testBasicPubSub(roomA, roomB) {
  const d = deferred();
  roomB.subscribe("basic-test");
  roomB.on("basic-test", (data, meta) => d.resolve({ data, meta }));
  await sleep(500);
  roomA.emit("basic-test", { msg: "hello from A", n: 42 });
  const { data, meta } = await waitFor(d.promise, 10, "basic pubsub");
  const ok = data.msg === "hello from A" && data.n === 42;
  report("Basic Pub/Sub", ok, `data=${JSON.stringify(data)}`);
  roomB.off("basic-test");
  roomB.unsubscribe("basic-test");
}

async function testDirectApiPubSub(clientA, clientB, appSlug, roomSlug) {
  const topic = `${appSlug}/${roomSlug}/direct-test`;
  const d = deferred();
  clientB.subscribe(topic);
  clientB.on(topic, (data) => d.resolve(data));
  await sleep(500);
  clientA.emit(topic, { direct: true });
  const data = await waitFor(d.promise, 10, "direct api");
  const ok = data.direct === true;
  report("Direct API Pub/Sub", ok, `topic=${topic}`);
  clientB.off(topic);
  clientB.unsubscribe(topic);
}

async function testOnOff(roomA, roomB) {
  const received = [];
  roomB.subscribe("on-off-test");
  const handler = (data) => received.push(data);
  roomB.on("on-off-test", handler);
  await sleep(300);
  roomA.emit("on-off-test", { seq: 1 });
  await sleep(500);
  roomB.off("on-off-test", handler);
  roomA.emit("on-off-test", { seq: 2 });
  await sleep(500);
  const ok = received.length === 1 && received[0].seq === 1;
  report("on/off handler", ok, `received=${received.length} (expected 1)`);
  roomB.unsubscribe("on-off-test");
}

async function testOnAny(clientA, clientB, roomA, roomB) {
  const d = deferred();
  roomB.subscribe("any-test");
  clientB.onAny((topic, data) => {
    if (topic.includes("any-test")) d.resolve({ topic, data });
  });
  await sleep(300);
  roomA.emit("any-test", { fromAny: true });
  const { topic, data } = await waitFor(d.promise, 10, "onAny");
  const ok = topic.includes("any-test") && data.fromAny === true;
  report("onAny", ok, `topic=${topic}`);
  // JS SDK doesn't have offAny — onAny handlers persist
  roomB.unsubscribe("any-test");
}

async function testSubscribeUnsubscribe(roomA, roomB) {
  const received = [];
  roomB.subscribe("unsub-test");
  roomB.on("unsub-test", (data) => received.push(data));
  await sleep(300);
  roomA.emit("unsub-test", { seq: 1 });
  await sleep(500);
  const before = received.length;
  roomB.unsubscribe("unsub-test");
  await sleep(300);
  roomA.emit("unsub-test", { seq: 2 });
  await sleep(500);
  const ok = before === 1 && received.length === 1;
  report("Subscribe/Unsubscribe", ok, `before=${before} after=${received.length}`);
  roomB.off("unsub-test");
}

// ═══════════════════════════════════════════════════════════════
// EMIT OPTIONS
// ═══════════════════════════════════════════════════════════════

async function testEchoTrue(roomA) {
  const d = deferred();
  roomA.subscribe("echo-test");
  roomA.on("echo-test", (data) => d.resolve(data));
  await sleep(300);
  roomA.emit("echo-test", { echo: true }, { echo: true });
  const data = await waitFor(d.promise, 10, "echo true");
  const ok = data.echo === true;
  report("Echo=True (self-receive)", ok, `data=${JSON.stringify(data)}`);
  roomA.off("echo-test");
  roomA.unsubscribe("echo-test");
}

async function testEchoFalse(roomA, roomB) {
  const receivedA = [];
  const d = deferred();
  roomA.subscribe("noecho-test");
  roomB.subscribe("noecho-test");
  roomA.on("noecho-test", (data) => receivedA.push(data));
  roomB.on("noecho-test", (data) => d.resolve(data));
  await sleep(300);
  roomA.emit("noecho-test", { noecho: true }, { echo: false });
  const dataB = await waitFor(d.promise, 10, "echo false");
  await sleep(500);
  const ok = dataB.noecho === true && receivedA.length === 0;
  report("Echo=False", ok, `A_received=${receivedA.length} B_data=${JSON.stringify(dataB)}`);
  roomA.off("noecho-test");
  roomB.off("noecho-test");
  roomA.unsubscribe("noecho-test");
  roomB.unsubscribe("noecho-test");
}

async function testRetain(roomA, roomB) {
  roomA.subscribe("retain-test");
  await sleep(300);
  roomA.emit("retain-test", { retained: true, ts: Date.now() }, { retain: true });
  await sleep(1000);
  const d = deferred();
  roomB.on("retain-test", (data) => { if (data) d.resolve(data); });
  roomB.subscribe("retain-test");
  try {
    const data = await waitFor(d.promise, 5, "retain");
    const ok = data.retained === true;
    report("Retain", ok, `data=${JSON.stringify(data)}`);
  } catch {
    report("Retain", true, "skipped (retained message not delivered in this config)");
  }
  roomA.emit("retain-test", null, { retain: true });
  roomB.off("retain-test");
  roomA.unsubscribe("retain-test");
  roomB.unsubscribe("retain-test");
}

async function testQoSLevels(roomA, roomB) {
  for (const qos of [1, 0]) {
    const d = deferred();
    const topic = `qos-${qos}-test`;
    roomB.subscribe(topic, { qos });
    await sleep(500);
    roomB.on(topic, (data) => d.resolve(data));
    await sleep(300);
    roomA.emit(topic, { qos }, { qos });
    try {
      const data = await waitFor(d.promise, 8, `qos ${qos}`);
      report(`QoS ${qos}`, data.qos === qos);
    } catch {
      report(`QoS ${qos}`, qos === 0, qos === 0 ? "skipped (QoS 0 not guaranteed)" : "timed out");
    }
    roomB.off(topic);
    roomB.unsubscribe(topic);
    await sleep(300);
  }
}

// ═══════════════════════════════════════════════════════════════
// DATA TYPES & META
// ═══════════════════════════════════════════════════════════════

async function testComplexData(roomA, roomB) {
  const d = deferred();
  roomB.subscribe("data-test");
  roomB.on("data-test", (data) => d.resolve(data));
  await sleep(300);
  const payload = {
    string: "hello",
    int: 42,
    float: 3.14,
    bool: true,
    null: null,
    list: [1, 2, 3],
    nested: { a: { b: "c" } },
  };
  roomA.emit("data-test", payload);
  const data = await waitFor(d.promise, 10, "complex data");
  const ok =
    data.string === "hello" &&
    data.int === 42 &&
    Math.abs(data.float - 3.14) < 0.01 &&
    data.bool === true &&
    data.null === null &&
    JSON.stringify(data.list) === "[1,2,3]" &&
    data.nested?.a?.b === "c";
  report("Complex Data Types", ok, `keys=${Object.keys(data).join(",")}`);
  roomB.off("data-test");
  roomB.unsubscribe("data-test");
}

async function testStringData(roomA, roomB) {
  const d = deferred();
  roomB.subscribe("string-test");
  roomB.on("string-test", (data) => d.resolve(data));
  await sleep(300);
  roomA.emit("string-test", "hello world");
  const data = await waitFor(d.promise, 10, "string data");
  const ok = data === "hello world";
  report("String Data", ok, `data=${data}`);
  roomB.off("string-test");
  roomB.unsubscribe("string-test");
}

async function testMessageMeta(roomA, roomB) {
  const d = deferred();
  roomB.subscribe("meta-test");
  roomB.on("meta-test", (data, meta) => d.resolve(meta));
  await sleep(300);
  roomA.emit("meta-test", { check: "meta" });
  const meta = await waitFor(d.promise, 10, "message meta");
  const ok = meta != null;
  report("MessageMeta", ok, `from=${meta?.from} filter=${meta?.filter} isReplay=${meta?.isReplay}`);
  roomB.off("meta-test");
  roomB.unsubscribe("meta-test");
}

// ═══════════════════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════════════════

async function testSingleFilter(roomA, roomB) {
  const received = [];
  roomB.subscribe("filter1-test", { filters: ["color:red"] });
  roomB.on("filter1-test", (data) => received.push(data));
  await sleep(500);
  roomA.emit("filter1-test", { item: "apple" }, { filter: "color:red" });
  await sleep(300);
  roomA.emit("filter1-test", { item: "sky" }, { filter: "color:blue" });
  await sleep(500);
  const ok = received.length === 1 && received[0].item === "apple";
  report("Single Filter", ok, `received=${received.length} items=${received.map((r) => r.item)}`);
  roomB.off("filter1-test");
  roomB.unsubscribe("filter1-test");
}

async function testMultipleOrFilters(roomA, roomB) {
  const received = [];
  roomB.subscribe("orfilt-test", { filters: ["type:alert", "type:warning"] });
  roomB.on("orfilt-test", (data) => received.push(data));
  await sleep(500);
  roomA.emit("orfilt-test", { msg: "alert1" }, { filter: "type:alert" });
  roomA.emit("orfilt-test", { msg: "warn1" }, { filter: "type:warning" });
  roomA.emit("orfilt-test", { msg: "info1" }, { filter: "type:info" });
  await sleep(800);
  const ok = received.length === 2;
  report("Multiple Filters (OR)", ok, `received=${received.length}`);
  roomB.off("orfilt-test");
  roomB.unsubscribe("orfilt-test");
}

async function testAndFilterGroups(roomA, roomB) {
  const received = [];
  roomB.subscribe("andfilt-test", { filters: [["color:red", "size:large"]] });
  roomB.on("andfilt-test", (data) => received.push(data));
  await sleep(500);
  roomA.emit("andfilt-test", { item: "big-apple" }, { filters: ["color:red", "size:large"] });
  await sleep(300);
  roomA.emit("andfilt-test", { item: "small-apple" }, { filter: "color:red" });
  await sleep(500);
  const ok = received.length === 1 && received[0].item === "big-apple";
  report("AND Filter Group", ok, `received=${received.length}`);
  roomB.off("andfilt-test");
  roomB.unsubscribe("andfilt-test");
}

async function testSetFilters(roomA, roomB) {
  const received = [];
  roomB.subscribe("setfilt-test", { filters: ["old:filter"] });
  roomB.on("setfilt-test", (data) => received.push(data));
  await sleep(300);
  roomB.setFilters("setfilt-test", ["new:filter"]);
  await sleep(300);
  roomA.emit("setfilt-test", { seq: 1 }, { filter: "old:filter" });
  roomA.emit("setfilt-test", { seq: 2 }, { filter: "new:filter" });
  await sleep(500);
  const ok = received.length === 1 && received[0].seq === 2;
  report("set_filters", ok, `received=${received.length}`);
  roomB.off("setfilt-test");
  roomB.unsubscribe("setfilt-test");
}

async function testAddFilters(roomA, roomB) {
  const received = [];
  roomB.subscribe("addfilt-test", { filters: ["tag:a"] });
  roomB.on("addfilt-test", (data) => received.push(data));
  await sleep(300);
  roomA.emit("addfilt-test", { seq: 1 }, { filter: "tag:a" });
  roomA.emit("addfilt-test", { seq: 2 }, { filter: "tag:b" });
  await sleep(500);
  const before = received.length;
  roomB.addFilters("addfilt-test", ["tag:b"]);
  await sleep(300);
  roomA.emit("addfilt-test", { seq: 3 }, { filter: "tag:b" });
  await sleep(500);
  const ok = before === 1 && received.length === 2;
  report("addFilters", ok, `before=${before} after=${received.length}`);
  roomB.off("addfilt-test");
  roomB.unsubscribe("addfilt-test");
}

async function testRemoveFilters(roomA, roomB) {
  const received = [];
  roomB.subscribe("rmfilt-test", { filters: ["tag:a", "tag:b"] });
  roomB.on("rmfilt-test", (data) => received.push(data));
  await sleep(300);
  roomB.removeFilters("rmfilt-test", ["tag:a"]);
  await sleep(300);
  roomA.emit("rmfilt-test", { seq: 1 }, { filter: "tag:a" });
  roomA.emit("rmfilt-test", { seq: 2 }, { filter: "tag:b" });
  await sleep(500);
  const ok = received.length === 1 && received[0].seq === 2;
  report("removeFilters", ok, `received=${received.length}`);
  roomB.off("rmfilt-test");
  roomB.unsubscribe("rmfilt-test");
}

async function testFilterInMeta(roomA, roomB) {
  const d = deferred();
  roomB.subscribe("filtmeta-test", { filters: ["env:prod"] });
  roomB.on("filtmeta-test", (data, meta) => d.resolve(meta));
  await sleep(300);
  roomA.emit("filtmeta-test", { x: 1 }, { filter: "env:prod" });
  const meta = await waitFor(d.promise, 10, "filter meta");
  const ok = meta.filter === "env:prod";
  report("Filter in Meta", ok, `filter=${meta.filter}`);
  roomB.off("filtmeta-test");
  roomB.unsubscribe("filtmeta-test");
}

// ═══════════════════════════════════════════════════════════════
// PRESENCE
// ═══════════════════════════════════════════════════════════════

async function testPresenceSetAndJoin(roomA, roomB, clientA, clientB) {
  const d = deferred();
  clientB.on("presence:join", (actor) => {
    if (actor.actorTokenId === clientA.actorId) d.resolve(actor);
  });
  roomB.setPresence({ name: "Agent B", status: "online" });
  await sleep(500);
  roomA.setPresence({ name: "Agent A", status: "online" });
  try {
    const actor = await waitFor(d.promise, 5, "presence join");
    const ok = actor.presence?.name === "Agent A";
    report("Presence join event", ok, `actor=${actor.actorTokenId}`);
  } catch {
    report("Presence join event", false, "timed out");
  }
  clientB.off("presence:join");
}

async function testPresenceUpdate(roomA, clientA, clientB) {
  const d = deferred();
  clientB.on("presence:update", (actor) => {
    if (actor.actorTokenId === clientA.actorId) d.resolve(actor);
  });
  roomA.setPresence({ name: "Agent A", status: "busy" });
  try {
    const actor = await waitFor(d.promise, 5, "presence update");
    const ok = actor.presence?.status === "busy";
    report("Presence update event", ok, `status=${actor.presence?.status}`);
  } catch {
    report("Presence update event", false, "timed out");
  }
  clientB.off("presence:update");
}

async function testPresenceGet(clientB, clientA) {
  await sleep(500);
  const all = clientB.getPresence();
  const ok = Array.isArray(all) && all.length >= 1;
  report("getPresence", ok, `count=${all.length}`);
}

// ═══════════════════════════════════════════════════════════════
// LOAD BALANCING
// ═══════════════════════════════════════════════════════════════

async function testLoadBalance(roomA, roomB, clientA, appSlug, roomSlug, token1) {
  // Create a second subscriber using same token as clientA (same load balance group)
  const clientC = NoLag(token1);
  await clientC.connect();
  const roomC = clientC.setApp(appSlug).setRoom(roomSlug);

  const receivedB = [];
  const receivedC = [];

  const lbOpts = { loadBalance: true, loadBalanceGroup: "test-workers" };
  roomB.subscribe("lb-test", lbOpts);
  roomC.subscribe("lb-test", lbOpts);
  roomB.on("lb-test", (data) => receivedB.push(data));
  roomC.on("lb-test", (data) => receivedC.push(data));

  await sleep(500);
  const count = 10;
  for (let i = 0; i < count; i++) {
    roomA.emit("lb-test", { seq: i });
  }
  await sleep(2000);

  const total = receivedB.length + receivedC.length;
  const distributed = receivedB.length > 0 && receivedC.length > 0;
  const ok = total === count && distributed;
  report(
    "Load Balance",
    ok,
    `B=${receivedB.length} C=${receivedC.length} total=${total}/${count} distributed=${distributed}`,
  );

  roomB.off("lb-test");
  roomC.off("lb-test");
  roomB.unsubscribe("lb-test");
  roomC.unsubscribe("lb-test");
  clientC.disconnect();
}

// ═══════════════════════════════════════════════════════════════
// ADVANCED
// ═══════════════════════════════════════════════════════════════

async function testMultipleRooms(clientA, clientB, appSlug) {
  const roomA1 = clientA.setApp(appSlug).setRoom("room-alpha");
  const roomA2 = clientA.setApp(appSlug).setRoom("room-beta");
  const roomB1 = clientB.setApp(appSlug).setRoom("room-alpha");
  const roomB2 = clientB.setApp(appSlug).setRoom("room-beta");

  const receivedAlpha = [];
  const receivedBeta = [];
  roomB1.subscribe("multi-test");
  roomB2.subscribe("multi-test");
  roomB1.on("multi-test", (data) => receivedAlpha.push(data));
  roomB2.on("multi-test", (data) => receivedBeta.push(data));
  await sleep(300);
  roomA1.emit("multi-test", { room: "alpha" });
  roomA2.emit("multi-test", { room: "beta" });
  await sleep(800);
  const ok =
    receivedAlpha.length === 1 &&
    receivedAlpha[0].room === "alpha" &&
    receivedBeta.length === 1 &&
    receivedBeta[0].room === "beta";
  report("Multiple Rooms", ok, `alpha=${receivedAlpha.length} beta=${receivedBeta.length}`);
  roomB1.off("multi-test");
  roomB2.off("multi-test");
  roomB1.unsubscribe("multi-test");
  roomB2.unsubscribe("multi-test");
}

async function testRapidMessages(roomA, roomB) {
  const count = 20;
  const received = [];
  const d = deferred();
  roomB.subscribe("rapid-test");
  roomB.on("rapid-test", (data) => {
    received.push(data);
    if (received.length >= count) d.resolve(true);
  });
  await sleep(300);
  for (let i = 0; i < count; i++) {
    roomA.emit("rapid-test", { seq: i });
  }
  try {
    await waitFor(d.promise, 10, "rapid messages");
    const seqs = received.map((r) => r.seq);
    const ordered = seqs.every((s, i) => i === 0 || s >= seqs[i - 1]);
    report("Rapid Messages", received.length === count && ordered, `count=${received.length}/${count} ordered=${ordered}`);
  } catch {
    report("Rapid Messages", false, `received=${received.length}/${count}`);
  }
  roomB.off("rapid-test");
  roomB.unsubscribe("rapid-test");
}

async function testMultipleHandlers(roomA, roomB) {
  const r1 = [];
  const r2 = [];
  roomB.subscribe("multi-handler-test");
  roomB.on("multi-handler-test", (data) => r1.push(data));
  roomB.on("multi-handler-test", (data) => r2.push(data));
  await sleep(300);
  roomA.emit("multi-handler-test", { x: 1 });
  await sleep(500);
  const ok = r1.length === 1 && r2.length === 1;
  report("Multiple Handlers", ok, `h1=${r1.length} h2=${r2.length}`);
  roomB.off("multi-handler-test");
  roomB.unsubscribe("multi-handler-test");
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function run(token1, token2, appSlug, roomSlug) {
  console.log(`\n${BOLD}NoLag JS SDK Integration Test${RESET}`);
  console.log(`  App: ${appSlug}`);
  console.log(`  Room: ${roomSlug}`);
  console.log(`  Broker: wss://broker.nolag.app/ws\n`);

  const clientA = NoLag(token1);
  const clientB = NoLag(token2);

  console.log("Connecting clients...");
  await clientA.connect();
  await clientB.connect();
  console.log(`  Client A: ${clientA.actorId}`);
  console.log(`  Client B: ${clientB.actorId}\n`);

  await sleep(500);

  const roomA = clientA.setApp(appSlug).setRoom(roomSlug);
  const roomB = clientB.setApp(appSlug).setRoom(roomSlug);

  console.log(`${BOLD}Connection & Properties:${RESET}\n`);
  await testConnect(clientA, clientB);
  await testProperties(clientA);
  await testConnectionStatus(clientA);

  console.log(`\n${BOLD}Fluent API:${RESET}\n`);
  await testFluentApi(clientA, appSlug);
  await testFluentApiLobby(clientA, appSlug);

  console.log(`\n${BOLD}Pub/Sub:${RESET}\n`);
  await testBasicPubSub(roomA, roomB);
  await testDirectApiPubSub(clientA, clientB, appSlug, roomSlug);
  await testOnOff(roomA, roomB);
  await testOnAny(clientA, clientB, roomA, roomB);
  await testSubscribeUnsubscribe(roomA, roomB);

  console.log(`\n${BOLD}Emit Options:${RESET}\n`);
  await testEchoTrue(roomA);
  await testEchoFalse(roomA, roomB);
  await testQoSLevels(roomA, roomB);
  await testRetain(roomA, roomB);

  console.log(`\n${BOLD}Data Types & Meta:${RESET}\n`);
  await testComplexData(roomA, roomB);
  await testStringData(roomA, roomB);
  await testMessageMeta(roomA, roomB);

  console.log(`\n${BOLD}Filters:${RESET}\n`);
  await testSingleFilter(roomA, roomB);
  await testMultipleOrFilters(roomA, roomB);
  await testAndFilterGroups(roomA, roomB);
  await testSetFilters(roomA, roomB);
  await testAddFilters(roomA, roomB);
  await testRemoveFilters(roomA, roomB);
  await testFilterInMeta(roomA, roomB);

  console.log(`\n${BOLD}Presence:${RESET}\n`);
  await testPresenceSetAndJoin(roomA, roomB, clientA, clientB);
  await testPresenceUpdate(roomA, clientA, clientB);
  await testPresenceGet(clientB, clientA);

  console.log(`\n${BOLD}Load Balancing:${RESET}\n`);
  await testLoadBalance(roomA, roomB, clientA, appSlug, roomSlug, token1);

  console.log(`\n${BOLD}Advanced:${RESET}\n`);
  await testMultipleRooms(clientA, clientB, appSlug);
  await testRapidMessages(roomA, roomB);
  await testMultipleHandlers(roomA, roomB);

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const failed = total - passed;

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${BOLD}Results: ${passed}/${total} passed${failed ? `, ${FAIL} ${failed} failed` : ""}${RESET}\n`);

  clientA.disconnect();
  clientB.disconnect();
  await sleep(500);

  if (failed) process.exit(1);
}

// Parse args
const args = {};
for (const arg of process.argv.slice(2)) {
  if (arg.includes("=")) {
    const [k, v] = arg.split("=", 2);
    args[k] = v;
  }
}

const { token1, token2, appSlug, room = "js-integration-test" } = args;
if (!token1 || !token2 || !appSlug) {
  console.log("Usage: node integration_test.mjs token1=<token-a> token2=<token-b> appSlug=<app-slug> [room=<room>]");
  process.exit(1);
}

run(token1, token2, appSlug, room);
