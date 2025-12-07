# NoLag SDK v2

Real-time messaging SDK for browser and Node.js. Socket.IO-style API for the NoLag platform.

## Installation

```bash
npm install @nolag/sdk
```

## Quick Start

```typescript
import { nolag } from "@nolag/sdk";

const socket = nolag("your_actor_token");

socket.on("connect", () => {
  console.log("Connected!");

  // Set your presence
  socket.setPresence({ username: "Alice", status: "online" });

  // Subscribe to topics
  socket.subscribe("myapp.lobby.messages");
});

socket.on("myapp.lobby.messages", (data) => {
  console.log("Received:", data);
});

// Publish messages
socket.emit("myapp.lobby.messages", { text: "Hello world!" });

// Connect
await socket.connect();
```

## API Reference

### Creating a Connection

```typescript
import { nolag } from "@nolag/sdk";

const socket = nolag(token, options);
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | `string` | Actor access token from NoLag API |
| `options` | `NoLagOptions` | Connection options (optional) |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | `wss://broker.nolag.app/ws` | WebSocket server URL |
| `reconnect` | `boolean` | `true` | Auto-reconnect on disconnect |
| `reconnectInterval` | `number` | `5000` | Reconnect delay in ms |
| `disconnectOnHidden` | `boolean` | `false` | Disconnect when browser tab hidden |
| `debug` | `boolean` | `false` | Enable debug logging |

### Connection Methods

#### `socket.connect()`

Connect to NoLag. Returns a Promise that resolves when connected.

```typescript
await socket.connect();
```

#### `socket.disconnect()`

Disconnect from NoLag.

```typescript
socket.disconnect();
```

### Connection Properties

| Property | Type | Description |
|----------|------|-------------|
| `socket.connected` | `boolean` | Connection status |
| `socket.status` | `ConnectionStatus` | `"disconnected"`, `"connecting"`, `"connected"`, `"reconnecting"` |
| `socket.actorId` | `string \| null` | Your actor token ID |
| `socket.actorType` | `ActorType \| null` | `"device"`, `"user"`, or `"server"` |
| `socket.projectId` | `string \| null` | Project ID |
| `socket.subscriptions` | `string[]` | List of subscribed topics |

### Connection Events

```typescript
socket.on("connect", () => {
  console.log("Connected!");
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
});

socket.on("reconnect", () => {
  console.log("Reconnected!");
});

socket.on("error", (error) => {
  console.error("Error:", error);
});
```

---

## Topics

Topics use a hierarchical pattern: `{app}.{room}.{topic}`

### Subscribing

```typescript
// Subscribe to a topic
socket.subscribe("myapp.lobby.messages");

// With callback
socket.subscribe("myapp.lobby.messages", (error) => {
  if (error) {
    console.error("Subscribe failed:", error);
  }
});
```

### Unsubscribing

```typescript
socket.unsubscribe("myapp.lobby.messages");
```

### Receiving Messages

```typescript
// Listen to specific topic
socket.on("myapp.lobby.messages", (data, meta) => {
  console.log("Data:", data);
  console.log("From:", meta.from); // sender actorId
});

// Listen to all topics (wildcard)
socket.onAny((topic, data, meta) => {
  console.log(`[${topic}]`, data);
});
```

### Publishing Messages

```typescript
// Simple emit
socket.emit("myapp.lobby.messages", { text: "Hello!" });

// With acknowledgment callback
socket.emit("myapp.lobby.messages", { text: "Hello!" }, (error) => {
  if (error) {
    console.error("Emit failed:", error);
  } else {
    console.log("Message sent!");
  }
});

// With options
socket.emit("myapp.lobby.messages", { text: "Hello!" }, {
  noEcho: true  // Don't receive your own message
});
```

---

## Presence

Presence is project-level - when you're online, you're visible to all actors in the project.

### Setting Presence

```typescript
// Set your presence data
socket.setPresence({
  username: "Alice",
  status: "online",
  avatar: "/img/alice.png"
});

// Update presence
socket.setPresence({
  username: "Alice",
  status: "away"
});
```

### Presence Events

```typescript
// Someone joined
socket.on("presence:join", (actor) => {
  console.log(`${actor.presence.username} is online`);
  console.log("Actor ID:", actor.actorTokenId);
  console.log("Actor type:", actor.actorType);
});

// Someone left
socket.on("presence:leave", (actor) => {
  console.log(`${actor.actorTokenId} went offline`);
});

// Someone updated their presence
socket.on("presence:update", (actor) => {
  console.log(`${actor.presence.username} is now ${actor.presence.status}`);
});
```

### Getting Presence

```typescript
// Get all online actors
const everyone = socket.getPresence();
// Returns: ActorPresence[]

// Get specific actor
const alice = socket.getPresence("actor_token_id_123");
// Returns: ActorPresence | undefined
```

**ActorPresence type:**

```typescript
interface ActorPresence {
  actorTokenId: string;
  actorType: "device" | "user" | "server";
  presence: Record<string, unknown>;  // Your custom data
  joinedAt?: number;
}
```

---

## Full Example

```typescript
import { nolag } from "@nolag/sdk";

async function main() {
  // Create socket with actor token
  const socket = nolag("act_xxxxxxxxxxxx", {
    debug: true,
    reconnect: true,
  });

  // Connection events
  socket.on("connect", () => {
    console.log("✓ Connected as:", socket.actorId);

    // Set presence
    socket.setPresence({
      username: "Alice",
      status: "online",
    });

    // Subscribe to chat
    socket.subscribe("chatapp.general.messages");
  });

  socket.on("disconnect", (reason) => {
    console.log("✗ Disconnected:", reason);
  });

  socket.on("error", (err) => {
    console.error("Error:", err);
  });

  // Presence events
  socket.on("presence:join", (actor) => {
    console.log(`→ ${actor.presence.username} joined`);
  });

  socket.on("presence:leave", (actor) => {
    console.log(`← ${actor.actorTokenId} left`);
  });

  // Message handler
  socket.on("chatapp.general.messages", (data, meta) => {
    const sender = socket.getPresence(meta.from);
    const name = sender?.presence?.username || "Unknown";
    console.log(`[${name}]: ${data.text}`);
  });

  // Connect
  await socket.connect();

  // Send a message
  socket.emit("chatapp.general.messages", {
    text: "Hello everyone!",
  });
}

main().catch(console.error);
```

---

## Browser Usage

```html
<script type="module">
  import { nolag } from "https://unpkg.com/@nolag/sdk/dist/browser.js";

  const socket = nolag("your_token");

  socket.on("connect", () => {
    console.log("Connected!");
  });

  socket.connect();
</script>
```

---

## TypeScript

Full TypeScript support included. Import types as needed:

```typescript
import {
  nolag,
  NoLagSocket,
  NoLagOptions,
  ActorPresence,
  ConnectionStatus,
  ActorType,
  MessageMeta,
} from "@nolag/sdk";
```

---

## License

MIT
