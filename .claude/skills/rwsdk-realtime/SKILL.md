---
name: rwsdk-realtime
description: Use when building realtime features with rwsdk/RedwoodSDK on Cloudflare - covers WebSocket setup, Durable Objects configuration, bidirectional client-server updates, and scoped realtime groups. Triggers include collaborative editing, live updates, multi-user sync, or any feature needing push updates without polling.
---

# rwsdk Realtime

Two patterns for realtime updates in rwsdk:

| Pattern            | Use Case                           | Granularity  |
| ------------------ | ---------------------------------- | ------------ |
| **Page-wide RSC**  | Full page re-renders on any change | Entire route |
| **useSyncedState** | Individual state values synced     | Per-value    |

Both use Cloudflare Durable Objects + WebSockets. No polling.

---

## Pattern 1: Page-Wide RSC Realtime

Re-renders the entire page for all connected clients when state changes. Best for collaborative documents, dashboards, or any page where all clients should see the same live view.

### Setup (4 Parts)

#### 1. Client Initialization

```tsx
import { initRealtimeClient } from "rwsdk/realtime/client";

initRealtimeClient({ key: window.location.pathname });
```

The `key` groups clients—all clients with matching keys receive the same updates.

#### 2. Export Durable Object

```ts
// src/worker.tsx
export { RealtimeDurableObject } from "rwsdk/realtime/durableObject";
```

#### 3. Wire Up Route

```ts
import { realtimeRoute } from "rwsdk/realtime/worker";
import { env } from "cloudflare:workers";

export default defineApp([
  realtimeRoute(() => env.REALTIME_DURABLE_OBJECT),
  // ... your routes
]);
```

#### 4. Configure wrangler.jsonc

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "REALTIME_DURABLE_OBJECT",
        "class_name": "RealtimeDurableObject",
      },
    ],
  },
}
```

Run `pnpm generate` after updating wrangler.jsonc.

### Using a Realtime Document

Routes using realtime **must** use the realtime-enabled Document. Import from rwsdk/realtime:

```tsx
import { Document } from "rwsdk/realtime/Document";

const App = ({ children }) => (
  <Document>
    <html>
      <body>{children}</body>
    </html>
  </Document>
);
```

### Triggering Updates with renderRealtimeClients

**This is the core mechanism for server-push updates.** Use `renderRealtimeClients` whenever you need to push updates to clients from server-side events:

```ts
import { renderRealtimeClients } from "rwsdk/realtime/worker";
import { env } from "cloudflare:workers";

// Push update to all clients watching this key
await renderRealtimeClients({
  durableObjectNamespace: env.REALTIME_DURABLE_OBJECT,
  key: "/note/some-id",
});
```

**When to use renderRealtimeClients:**

- Background job completions
- Database triggers / webhooks
- Admin actions affecting user views
- Cron job updates
- Any server-initiated state change

Without calling `renderRealtimeClients`, clients won't see server-side changes until they trigger an action themselves.

### Update Flow

1. Event occurs (user action OR server event)
2. App state updates
3. Re-render triggers:
   - **User action**: Automatic via RSC action
   - **Server event**: Call `renderRealtimeClients()` explicitly
4. All clients with matching `key` receive updated UI

---

## Pattern 2: useSyncedState Hook

Syncs individual state values across clients. Like `useState` but bidirectional with the server. Best for granular shared state without full page re-renders.

### Setup

#### 1. Export Durable Object & Routes

```tsx
// src/worker.tsx
import { env } from "cloudflare:workers";
import {
  SyncedStateServer,
  syncedStateRoutes,
} from "rwsdk/use-synced-state/worker";
import { defineApp } from "rwsdk/worker";

export { SyncedStateServer };

export default defineApp([
  ...syncedStateRoutes(() => env.SYNCED_STATE_SERVER),
  // ... your routes
]);
```

#### 2. Configure wrangler.jsonc

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "SYNCED_STATE_SERVER",
        "class_name": "SyncedStateServer",
      },
    ],
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["SyncedStateServer"],
    },
  ],
}
```

Run `pnpm generate` after updating.

### Basic Usage

```tsx
"use client";

import { useSyncedState } from "rwsdk/use-synced-state/client";

export const SharedCounter = () => {
  // Args: initialValue, key, roomId (optional)
  const [count, setCount] = useSyncedState(0, "counter");

  return <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>;
};
```

### Room Scoping

Isolate state to specific groups:

```tsx
const [messages, setMessages] = useSyncedState<string[]>(
  [],
  "messages",
  roomId,
);
```

Different room IDs = isolated state. Users in `room-1` won't see `room-2` updates.

### Server-Side Key/Room Handlers

Transform keys or rooms on the server for auth-based scoping:

```tsx
// Scope user-prefixed keys to current user
SyncedStateServer.registerKeyHandler(async (key, stub) => {
  const userId = requestInfo.ctx.userId;
  if (key.startsWith("user:")) {
    return `${key}:${userId}`;
  }
  return key;
});

// Transform room IDs
SyncedStateServer.registerRoomHandler(async (roomId, reqInfo) => {
  if (roomId === "private" && reqInfo?.ctx?.userId) {
    return `user:${reqInfo.ctx.userId}`;
  }
  return roomId ?? "syncedState";
});
```

### Persistence Handlers

State is in-memory by default. Add persistence:

```tsx
SyncedStateServer.registerSetStateHandler((key, value) => {
  // Save to database
});

SyncedStateServer.registerGetStateHandler((key, value) => {
  // Load from database if value undefined
});
```

---

## Choosing a Pattern

| Consideration  | Page-wide RSC                  | useSyncedState            |
| -------------- | ------------------------------ | ------------------------- |
| Update scope   | Entire page                    | Individual values         |
| Re-render cost | Higher (full RSC)              | Lower (state only)        |
| Server logic   | Runs on every update           | Client-side updates       |
| Best for       | Collaborative docs, dashboards | Counters, presence, forms |

**Combine both**: Use page-wide realtime for the main view, useSyncedState for ephemeral UI state (typing indicators, cursor positions).

---

## API Reference

### Page-wide RSC

| Function                                                  | Purpose                                          |
| --------------------------------------------------------- | ------------------------------------------------ |
| `initRealtimeClient({ key? })`                            | Initialize WebSocket. `key` scopes client group. |
| `realtimeRoute((env) => namespace)`                       | Connect route to Durable Object.                 |
| `renderRealtimeClients({ durableObjectNamespace, key? })` | **Push re-render to all clients in key group.**  |

### useSyncedState

| Function                                        | Purpose                         |
| ----------------------------------------------- | ------------------------------- |
| `useSyncedState(initial, key, roomId?)`         | Synced state hook.              |
| `syncedStateRoutes(() => namespace)`            | Register synced state routes.   |
| `SyncedStateServer.registerKeyHandler(fn)`      | Transform keys server-side.     |
| `SyncedStateServer.registerRoomHandler(fn)`     | Transform room IDs server-side. |
| `SyncedStateServer.registerSetStateHandler(fn)` | Hook into state updates.        |
| `SyncedStateServer.registerGetStateHandler(fn)` | Hook into state retrieval.      |
