---
name: cloudflare-sandbox-hono
description: Run Hono HTTP servers inside Cloudflare Sandboxes for isolated code execution. Use when building agentic applications that need isolated Node.js environments, AI agents with filesystem access, or any workload requiring secure code execution. Covers the critical 0.0.0.0 hostname binding, proxyToSandbox routing, health check patterns, and authentication middleware.
---

# Cloudflare Sandbox with Hono Server

Run isolated Hono HTTP servers inside Cloudflare Sandboxes for secure, per-session code execution.

## When to Use Sandbox + Hono

| Use Case | Solution |
| --- | --- |
| AI agent with filesystem access | Sandbox + Hono |
| Per-session isolated execution | Sandbox + Hono |
| Long-running processes with HTTP API | Sandbox + Hono |
| Simple code execution (exec only) | Sandbox SDK direct |
| Full container control | Containers |

## Architecture Overview

```
┌─────────────────────┐     ┌──────────────────────────────────┐
│   Cloudflare Worker │     │       Cloudflare Sandbox         │
│                     │     │  ┌────────────────────────────┐  │
│  ┌───────────────┐  │     │  │     Hono Server            │  │
│  │ Queue Handler │──┼────▶│  │     (0.0.0.0:8080)         │  │
│  └───────────────┘  │     │  │                            │  │
│         │           │     │  │  ├─ /health                │  │
│  proxyToSandbox()   │     │  │  ├─ /chat (SSE stream)     │  │
│         │           │     │  │  └─ /resume                │  │
│         ▼           │     │  │                            │  │
│  ┌───────────────┐  │     │  │  /workspace/ filesystem    │  │
│  │  Orchestrator │  │     │  └────────────────────────────┘  │
│  │  (Durable Obj)│  │     └──────────────────────────────────┘
│  └───────────────┘  │
└─────────────────────┘
```

## Critical: Binding to 0.0.0.0

**The server MUST bind to `0.0.0.0`, not `localhost` or `127.0.0.1`.**

This is required because the sandbox networking routes traffic to the container's external interface. Binding to localhost only accepts connections from within the container itself.

```typescript
// sandbox/server.ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();
const port = parseInt(process.env.PORT || '8080');

// CRITICAL: hostname must be '0.0.0.0' for sandbox networking
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
console.log(`Server running at http://0.0.0.0:${port}`);
```

## Package Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.7",
    "@hono/node-server": "^1.13.1",
    "hono": "^4.6.0"
  }
}
```

## proxyToSandbox: Routing Requests

The `proxyToSandbox` function routes HTTP requests from the Worker to the sandbox's exposed port.

### Basic Usage

```typescript
import { getSandbox, proxyToSandbox } from '@cloudflare/sandbox';

// Get or create sandbox for this session
const sandbox = getSandbox(env.Sandbox, sandboxId, { normalizeId: true });

// Expose the port (returns URL for the exposed endpoint)
const { url: baseUrl } = await sandbox.exposePort(8080, {
  hostname: 'localhost:5173', // Your worker's hostname
});

// Route request through proxy
const response = await proxyToSandbox(
  new Request(`${baseUrl}chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.SANDBOX_SECRET}`,
    },
    body: JSON.stringify(payload),
  }),
  env
);
```

### Key Points

1. **proxyToSandbox wraps fetch** - Don't use regular `fetch()` for sandbox endpoints
2. **Authorization header required** - Pass a shared secret for authentication
3. **Response is streamed** - Works with SSE and streaming responses

## Complete Queue Handler Pattern

```typescript
import { getSandbox, proxyToSandbox } from '@cloudflare/sandbox';

const HOSTNAME = 'localhost:5173';
const PORT = 8080;

export async function processAgentMessage(body: QueueMessage): Promise<void> {
  const { sessionId } = body;

  // 1. Sanitize session ID for DNS-safe sandbox naming
  const sanitizedSessionId = sessionId
    .replace(/-/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 20);
  const sandboxId = `sb${sanitizedSessionId}`;

  // 2. Get sandbox instance
  const sandbox = getSandbox(env.Sandbox, sandboxId, { normalizeId: true });

  // 3. Set environment variables
  await sandbox.setEnvVars({
    SANDBOX_SECRET: env.SANDBOX_SECRET,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    PORT: '8080',
  });

  // 4. Check if port is already exposed (sandbox may be warm)
  let baseUrl = '';
  const exposedPorts = await sandbox.getExposedPorts(HOSTNAME);
  const serverPort = exposedPorts.find((p) => p.port === PORT);

  if (serverPort?.url) {
    baseUrl = serverPort.url;
  }

  // 5. Check if server is already running
  let serverRunning = false;
  if (baseUrl) {
    const check = await proxyToSandbox(
      new Request(`${baseUrl}health`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.SANDBOX_SECRET}` },
      }),
      env
    );
    serverRunning = check?.ok ?? false;
  }

  // 6. Start server if needed
  if (!serverRunning) {
    const serverProcess = await sandbox.startProcess('node /app/dist/server.js', {
      env: {
        PORT: '8080',
        SANDBOX_SECRET: env.SANDBOX_SECRET,
        ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
      },
    });

    // Wait for port to be ready
    await serverProcess.waitForPort(PORT, { timeout: 30000 });
  }

  // 7. Expose port if not already exposed
  if (!baseUrl) {
    const result = await sandbox.exposePort(8080, { hostname: HOSTNAME });
    baseUrl = result?.url || '';
  }

  // 8. Wait for health check with retries
  await waitForHealth(baseUrl, env);

  // 9. Make the actual request
  const response = await proxyToSandbox(
    new Request(`${baseUrl}chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SANDBOX_SECRET}`,
      },
      body: JSON.stringify(requestBody),
    }),
    env
  );

  // 10. Process streaming response
  await processSSEStream(response.body, orchestrator);
}
```

## Health Check with Retries

```typescript
async function waitForHealth(baseUrl: string, env: Env): Promise<void> {
  const maxRetries = 30;
  const retryDelayMs = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await proxyToSandbox(
        new Request(`${baseUrl}health`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${env.SANDBOX_SECRET}` },
        }),
        env
      );

      if (response?.ok) {
        return; // Server is ready
      }
    } catch {
      // Server not ready yet
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }

  throw new Error('Server failed to become ready after maximum retries');
}
```

## Hono Server with Authentication

```typescript
// sandbox/server.ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();
const SANDBOX_SECRET = process.env.SANDBOX_SECRET;

// Timing-safe comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Auth middleware - skip health checks
app.use('/*', async (c, next) => {
  if (c.req.path === '/health') {
    return next();
  }

  if (!SANDBOX_SECRET) {
    return next(); // Dev mode - no auth required
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing authorization' }, 401);
  }

  const token = authHeader.slice(7);
  if (!timingSafeEqual(token, SANDBOX_SECRET)) {
    return c.json({ error: 'Invalid token' }, 403);
  }

  return next();
});

// Health endpoint (unauthenticated)
app.get('/health', (c) => c.json({ status: 'ok' }));

// Main endpoints (authenticated)
app.post('/chat', async (c) => {
  // Handle chat request
});

app.post('/resume', async (c) => {
  // Handle permission resume
});

const port = parseInt(process.env.PORT || '8080');
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
```

## SSE Streaming from Hono

```typescript
import { streamSSE } from 'hono/streaming';

app.post('/chat', async (c) => {
  const { sessionId, messages } = await c.req.json();

  return streamSSE(c, async (stream) => {
    try {
      // Send initial status
      await stream.writeSSE({
        data: JSON.stringify({ type: 'status', status: { state: 'thinking' } }),
      });

      // Process and stream events
      for await (const event of processMessages(messages)) {
        await stream.writeSSE({ data: JSON.stringify(event) });
      }

      await stream.writeSSE({ data: JSON.stringify({ type: 'complete' }) });
    } catch (error) {
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
      });
    }
  });
});
```

## Processing SSE Streams in the Worker

```typescript
async function processSSEStream(
  body: ReadableStream<Uint8Array>,
  orchestrator: DurableObjectStub
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const event = JSON.parse(line.slice(6));

        switch (event.type) {
          case 'message':
            await updateOrchestrator(orchestrator, '/add-message', {
              message: event.message,
            });
            break;
          case 'status':
            await updateOrchestrator(orchestrator, '/update-status', {
              status: event.status,
            });
            break;
          // Handle other event types...
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

## Workspace and File Persistence

Files written to `/workspace` persist across requests within the same sandbox session:

```typescript
// In the Hono server
import { writeFile, readFile, existsSync } from 'fs/promises';
import { join } from 'path';

const WORKSPACE = existsSync('/workspace')
  ? '/workspace'
  : join(process.cwd(), 'workspace');

// Write session context
await writeFile(join(WORKSPACE, 'session-id.txt'), sessionId);
await writeFile(
  join(WORKSPACE, 'messages.json'),
  JSON.stringify(messages, null, 2)
);

// Read results later
const research = await readFile(join(WORKSPACE, 'research.md'), 'utf-8');
```

## Wrangler Configuration

```jsonc
{
  "name": "my-sandbox-app",
  "main": "src/worker.ts",
  "compatibility_date": "2025-01-01",
  "containers": [
    {
      "class_name": "Sandbox",
      "image": "./sandbox/Dockerfile",
      "max_instances": 10
    }
  ],
  "durable_objects": {
    "bindings": [
      { "class_name": "Sandbox", "name": "Sandbox" }
    ]
  }
}
```

## Common Pitfalls

| Problem | Cause | Solution |
| --- | --- | --- |
| Connection refused | Server bound to localhost | Use `hostname: '0.0.0.0'` |
| 401 Unauthorized | Missing/wrong auth header | Include `Bearer ${secret}` header |
| Health check timeout | Server slow to start | Increase retry count/delay |
| DNS label too long | Sandbox ID over 63 chars | Sanitize and truncate session IDs |
| Port not exposed | Called before exposePort | Check getExposedPorts first |

## Key Behaviors

| Behavior | Details |
| --- | --- |
| Sandbox isolation | Each sandbox ID gets isolated environment |
| Warm start | Re-uses running sandbox if port already exposed |
| Cold start | 2-5 seconds for server startup |
| File persistence | /workspace persists within session |
| Auto-shutdown | Sandbox sleeps after idle period |
