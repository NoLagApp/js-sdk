# @nolag/js-sdk

Real-time messaging SDK for browser and Node.js. Connects to NoLag via WebSocket with MessagePack binary protocol.

## Installation

```bash
npm install @nolag/js-sdk
```

## Setup

Before using the SDK, you need to set up your NoLag project:

1. **Create a Project** in the [NoLag Dashboard](https://app.nolag.app)
2. **Create an App** with your desired topics
3. **Create Topics** in your App schema (e.g., `messages`, `status`, `commands`)
4. **Create Actors** to get access tokens (`at_xxx...`)

> **Note:** Topics must be defined in your App schema before you can subscribe or publish to them. Rooms are created dynamically at runtime.

## Quick Start

```typescript
import { NoLag } from "@nolag/js-sdk";

// Create client with access token
const client = NoLag("your_actor_access_token");

// Set up event handlers
client.on("connect", () => {
  console.log("Connected!");

  // Set your presence
  client.setPresence({ username: "Alice", status: "online" });

  // Subscribe to topics
  client.subscribe("chat/lobby/messages");
});

// Listen for messages
client.on("chat/lobby/messages", (data, meta) => {
  console.log("Received:", data);
});

// Connect
await client.connect();

// Publish messages
client.emit("chat/lobby/messages", { text: "Hello world!" });
```

## Features

- **WebSocket + MessagePack** - Efficient binary protocol
- **Auto-reconnect** - Automatic reconnection with exponential backoff
- **Server-side subscription persistence** - Subscriptions restored automatically on reconnect
- **Presence** - Project-level presence tracking
- **Load Balancing** - Distribute messages across worker pools
- **Fluent API** - Scoped pub/sub with `setApp().setRoom()`
- **QoS Levels** - At-most-once, at-least-once, exactly-once delivery
- **TypeScript** - Full type definitions included
- **REST API Client** - Manage apps, rooms, and actors programmatically

---

## API Reference

### Creating a Client

```typescript
import { NoLag } from "@nolag/js-sdk";

const client = NoLag(token, options?);
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | `string` | Actor access token (required) |
| `options` | `NoLagOptions` | Configuration options (optional) |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | `wss://broker.nolag.app/ws` | WebSocket URL |
| `reconnect` | `boolean` | `true` | Auto-reconnect on disconnect |
| `reconnectInterval` | `number` | `5000` | Initial reconnect delay (ms) |
| `disconnectOnHidden` | `boolean` | `false` | Disconnect when browser tab hidden |
| `heartbeatInterval` | `number` | `30000` | Heartbeat interval (ms), 0 to disable |
| `debug` | `boolean` | `false` | Enable debug logging |
| `qos` | `0 \| 1 \| 2` | `1` | Default QoS level |
| `loadBalance` | `boolean` | `false` | Enable load balancing for all subscriptions |
| `loadBalanceGroup` | `string` | - | Load balance group name |

---

### Connection

```typescript
// Connect
await client.connect();

// Disconnect (prevents auto-reconnect)
client.disconnect();

// Check status
console.log(client.connected);  // boolean
console.log(client.status);     // "disconnected" | "connecting" | "connected" | "reconnecting"

// Client info (available after connect)
console.log(client.actorId);    // Actor token ID
console.log(client.actorType);  // "device" | "user" | "server"
console.log(client.projectId);  // Project ID
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
3. **Re-authenticate** - Sends auth token to server
4. **Server restores subscriptions** - All subscriptions automatically restored
5. **Re-send presence** - Presence data re-sent if previously set

**Max reconnect attempts:** 10 (then stops trying)

---

## Topics

Topics use path-style naming: `app/room/topic`

### Subscribing

```typescript
// Basic subscription
client.subscribe("chat/lobby/messages");

// With options
client.subscribe("chat/lobby/messages", {
  qos: 2,                        // Override default QoS
  loadBalance: true,             // Enable load balancing
  loadBalanceGroup: "workers",   // Specific group
});

// With acknowledgment callback
client.subscribe("chat/lobby/messages", (error) => {
  if (error) console.error("Subscribe failed:", error);
  else console.log("Subscribed!");
});

// Wildcard subscriptions
client.subscribe("chat/+/messages");   // Single level (+)
client.subscribe("users/123/#");       // Multi level (#)
```

### Unsubscribing

```typescript
client.unsubscribe("chat/lobby/messages");

// With callback
client.unsubscribe("chat/lobby/messages", (error) => {
  if (error) console.error("Unsubscribe failed:", error);
});
```

### Receiving Messages

```typescript
// Listen to specific topic
client.on("chat/lobby/messages", (data, meta) => {
  console.log("Data:", data);
  console.log("From:", meta.from);        // Sender's actorTokenId
  console.log("Time:", meta.timestamp);   // Server timestamp
});

// Listen to all subscribed topics (client-side wildcard)
client.onAny((topic, data, meta) => {
  console.log(`[${topic}]`, data);
});

// Remove handler
client.off("chat/lobby/messages", handler);

// Remove all handlers for a topic
client.off("chat/lobby/messages");
```

### Publishing Messages

```typescript
// Basic emit
client.emit("chat/lobby/messages", { text: "Hello!" });

// With options
client.emit("chat/lobby/messages", { text: "Hello!" }, {
  qos: 2,           // Override default QoS
  retain: true,     // Retain message for new subscribers
  echo: false,      // Don't receive your own message (default: true)
});

// With callback
client.emit("chat/lobby/messages", { text: "Hello!" }, (error) => {
  if (error) console.error("Emit failed:", error);
});

// With options and callback
client.emit("chat/lobby/messages", { text: "Hello!" }, { qos: 2 }, (error) => {
  if (error) console.error(error);
});
```

---

## Fluent API (Scoped Pub/Sub)

Scope subscriptions and messages to a specific app and room:

```typescript
// Create a room context
const room = client.setApp("chat").setRoom("general");

// Subscribe (topic auto-prefixed to "chat/general/messages")
room.subscribe("messages");

// Listen for messages
room.on("messages", (data, meta) => {
  console.log("Message:", data);
});

// Publish (also auto-prefixed)
room.emit("messages", { text: "Hello room!" });

// Get the full topic prefix
console.log(room.prefix); // "chat/general"

// Unsubscribe
room.unsubscribe("messages");
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

// Fetch fresh list from server (async)
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
const client = NoLag("token", { qos: 1 });

// Override per message
client.emit("important/data", data, { qos: 2 });

// Override per subscription
client.subscribe("critical/events", { qos: 2 });
```

---

## Load Balancing

Distribute messages across multiple clients in a group (round-robin):

```typescript
// Enable for all subscriptions
const client = NoLag("token", {
  loadBalance: true,
  loadBalanceGroup: "worker-pool-1"
});

// Or per-subscription
client.subscribe("jobs/process", {
  loadBalance: true,
  loadBalanceGroup: "job-workers"
});

// Only ONE client in the group receives each message
```

**Use cases:**
- Worker queues
- Distributed task processing
- Horizontal scaling

---

## REST API Client

Manage apps, rooms, and actors programmatically:

```typescript
import { NoLagApi } from "@nolag/js-sdk";

const api = new NoLagApi("your-api-key", {
  baseUrl: "https://api.nolag.app/v1",  // Optional
  timeout: 30000,                        // Optional
});

// Apps
const apps = await api.apps.list();
const app = await api.apps.create({ name: "My App" });
await api.apps.update(app.appId, { name: "Updated Name" });
await api.apps.delete(app.appId);

// Rooms
const rooms = await api.rooms.list(appId);
const room = await api.rooms.create(appId, { name: "General", slug: "general" });
await api.rooms.delete(appId, room.roomId);

// Actors
const actors = await api.actors.list();
const actor = await api.actors.create({
  name: "Device 1",
  actorType: "device"
});
console.log("Access Token:", actor.accessToken);  // Save this! Only shown once

await api.actors.update(actor.actorTokenId, { name: "Updated Device" });
await api.actors.delete(actor.actorTokenId);
```

---

## Full Example

```typescript
import { NoLag } from "@nolag/js-sdk";

async function main() {
  const client = NoLag("your_access_token", {
    debug: true,
    qos: 1,
  });

  // Connection events
  client.on("connect", () => {
    console.log("Connected as:", client.actorId);

    // Set presence
    client.setPresence({
      username: "Alice",
      status: "online",
    });

    // Subscribe using fluent API
    const room = client.setApp("chat").setRoom("general");
    room.subscribe("messages");

    room.on("messages", (data, meta) => {
      console.log(`Message from ${meta.from}:`, data);
    });
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

  // Presence events
  client.on("presence:join", (actor) => {
    console.log(`${actor.presence.username} joined`);
  });

  client.on("presence:leave", (actor) => {
    console.log(`${actor.actorTokenId} left`);
  });

  // Connect
  await client.connect();

  // Send a message
  const room = client.setApp("chat").setRoom("general");
  room.emit("messages", { text: "Hello everyone!" });
}

main().catch(console.error);
```

---

## Browser Usage

```html
<script type="module">
  import { NoLag } from "https://unpkg.com/@nolag/js-sdk/dist/browser.js";

  const client = NoLag("your_token");

  client.on("connect", () => {
    console.log("Connected!");
    client.subscribe("updates");
  });

  client.on("updates", (data) => {
    document.getElementById("output").textContent = JSON.stringify(data);
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
  NoLagApi,
  NoLagApiError,
  NoLagOptions,
  ConnectionStatus,
  ActorPresence,
  ActorType,
  MessageMeta,
  PresenceData,
  QoS,
  SubscribeOptions,
  EmitOptions,
  AppContext,
  RoomContext,
} from "@nolag/js-sdk";

// Type your message data
interface ChatMessage {
  text: string;
  sender: string;
  timestamp: number;
}

client.on("chat/room", (data: ChatMessage, meta: MessageMeta) => {
  console.log(`[${data.sender}]: ${data.text}`);
});
```

---

## Error Handling

```typescript
// Connection errors
client.on("error", (error) => {
  console.error("Client error:", error.message);
});

// Subscribe/emit callbacks
client.subscribe("topic", (error) => {
  if (error) console.error("Subscribe failed:", error.message);
});

client.emit("topic", data, (error) => {
  if (error) console.error("Emit failed:", error.message);
});

// REST API errors
import { NoLagApiError } from "@nolag/js-sdk";

try {
  await api.apps.get("invalid-id");
} catch (error) {
  if (error instanceof NoLagApiError) {
    console.error("API Error:", error.statusCode, error.message);
  }
}
```

---

## License

MIT
