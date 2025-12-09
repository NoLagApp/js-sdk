# @nolag/js-sdk

Real-time messaging SDK for browser and Node.js. Connects to Kraken Proxy via WebSocket with MessagePack.

## Installation

```bash
npm install @nolag/js-sdk
```

## Quick Start

```typescript
import { NoLag } from "@nolag/js-sdk";

const client = new NoLag({
  token: "your_actor_access_token",
});

client.on("connect", () => {
  console.log("Connected!");

  // Set your presence
  client.setPresence({ username: "Alice", status: "online" });

  // Subscribe to topics
  client.subscribe("chat/lobby/messages");
});

client.on("chat/lobby/messages", (data) => {
  console.log("Received:", data);
});

// Publish messages
client.emit("chat/lobby/messages", { text: "Hello world!" });

// Connect
await client.connect();
```

## Features

- **WebSocket + MessagePack** - Efficient binary protocol
- **Auto-reconnect** - Automatic reconnection with exponential backoff
- **Subscription persistence** - Automatic re-subscribe on reconnect
- **Presence** - Project-level presence tracking
- **TypeScript** - Full type definitions included

## API Reference

### Creating a Client

```typescript
import { NoLag } from "@nolag/js-sdk";

const client = new NoLag(options);
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `token` | `string` | Required | Actor access token |
| `url` | `string` | `wss://broker.nolag.app/ws` | Kraken Proxy URL |
| `reconnect` | `boolean` | `true` | Auto-reconnect on disconnect |
| `reconnectInterval` | `number` | `5000` | Initial reconnect delay (ms) |
| `disconnectOnHidden` | `boolean` | `false` | Disconnect when tab hidden |
| `debug` | `boolean` | `false` | Enable debug logging |
| `qos` | `0 \| 1 \| 2` | `1` | Default QoS level |

### Connection

```typescript
// Connect
await client.connect();

// Disconnect
client.disconnect();

// Check status
console.log(client.connected);  // boolean
console.log(client.status);     // "disconnected" | "connecting" | "connected" | "reconnecting"
```

### Connection Events

```typescript
client.on("connect", () => {
  console.log("Connected!");
});

client.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
});

client.on("reconnect", () => {
  console.log("Reconnecting...");
});

client.on("error", (error) => {
  console.error("Error:", error);
});
```

---

## Reconnection Behavior

The SDK automatically handles reconnection:

1. **Connection lost** - WebSocket closes unexpectedly
2. **Exponential backoff** - Waits 5s, 7.5s, 11.25s... (max 30s)
3. **Re-authenticate** - Sends auth token to Kraken Proxy
4. **Re-subscribe** - Automatically re-subscribes to all topics
5. **Restore presence** - Re-sends presence data if set

```typescript
// Subscriptions are tracked internally
client.subscribe("chat/lobby/messages");
client.subscribe("notifications");

// After reconnect, both topics are automatically re-subscribed
client.on("reconnect", () => {
  console.log("Reconnecting, will restore:", client.subscriptions);
  // ["chat/lobby/messages", "notifications"]
});
```

**Max reconnect attempts:** 10 (then stops trying)

---

## Topics

Topics use path-style naming: `app/room/topic`

### Subscribing

```typescript
// Subscribe to a topic
client.subscribe("chat/lobby/messages");

// With callback
client.subscribe("chat/lobby/messages", (error) => {
  if (error) console.error("Subscribe failed:", error);
});
```

### Unsubscribing

```typescript
client.unsubscribe("chat/lobby/messages");
```

### Receiving Messages

```typescript
// Listen to specific topic
client.on("chat/lobby/messages", (data, meta) => {
  console.log("Data:", data);
});

// Listen to all topics (wildcard)
client.onAny((topic, data, meta) => {
  console.log(`[${topic}]`, data);
});
```

### Publishing Messages

```typescript
// Simple emit
client.emit("chat/lobby/messages", { text: "Hello!" });

// With QoS
client.emit("chat/lobby/messages", { text: "Hello!" }, { qos: 2 });

// With callback
client.emit("chat/lobby/messages", { text: "Hello!" }, (error) => {
  if (error) console.error("Emit failed:", error);
});
```

---

## Presence

Presence is project-level - when you're online, you're visible to all actors in the project.

### Setting Presence

```typescript
// Set your presence data (persists across reconnects)
client.setPresence({
  username: "Alice",
  status: "online",
  avatar: "/img/alice.png"
});
```

### Presence Events

```typescript
// Someone joined
client.on("presence:join", (actor) => {
  console.log(`${actor.presence.username} is online`);
});

// Someone left
client.on("presence:leave", (actor) => {
  console.log(`${actor.actorTokenId} went offline`);
});

// Someone updated their presence
client.on("presence:update", (actor) => {
  console.log(`${actor.presence.username} is now ${actor.presence.status}`);
});
```

### Getting Presence

```typescript
// Get all online actors (local cache)
const everyone = client.getPresence();

// Get specific actor
const alice = client.getPresence("actor_token_id_123");

// Fetch from server (async)
const presenceList = await client.fetchPresence();
```

---

## QoS Levels

| Level | Name | Description |
|-------|------|-------------|
| 0 | At most once | Fire and forget, no guarantee |
| 1 | At least once | Guaranteed delivery, may duplicate |
| 2 | Exactly once | Guaranteed single delivery |

```typescript
// Set default QoS
const client = new NoLag({
  token: "...",
  qos: 1  // Default for all messages
});

// Override per message
client.emit("important/data", data, { qos: 2 });
```

---

## Full Example

```typescript
import { NoLag } from "@nolag/js-sdk";

async function main() {
  const client = new NoLag({
    token: "your_access_token",
    debug: true,
  });

  // Connection events
  client.on("connect", () => {
    console.log("Connected as:", client.actorId);

    // Set presence
    client.setPresence({
      username: "Alice",
      status: "online",
    });

    // Subscribe to chat
    client.subscribe("chat/general/messages");
  });

  client.on("disconnect", (reason) => {
    console.log("Disconnected:", reason);
  });

  client.on("reconnect", () => {
    console.log("Reconnecting...");
  });

  // Presence events
  client.on("presence:join", (actor) => {
    console.log(`${actor.presence.username} joined`);
  });

  client.on("presence:leave", (actor) => {
    console.log(`${actor.actorTokenId} left`);
  });

  // Message handler
  client.on("chat/general/messages", (data, meta) => {
    console.log(`Message: ${data.text}`);
  });

  // Connect
  await client.connect();

  // Send a message
  client.emit("chat/general/messages", {
    text: "Hello everyone!",
  });
}

main().catch(console.error);
```

---

## Browser Usage

```html
<script type="module">
  import { NoLag } from "https://unpkg.com/@nolag/js-sdk/dist/browser.js";

  const client = new NoLag({
    token: "your_token"
  });

  client.on("connect", () => {
    console.log("Connected!");
  });

  client.connect();
</script>
```

---

## TypeScript

Full TypeScript support included:

```typescript
import {
  NoLag,
  NoLagOptions,
  ActorPresence,
  ConnectionStatus,
  ActorType,
  MessageMeta,
  QoS,
} from "@nolag/js-sdk";
```

---

## License

MIT
