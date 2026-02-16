---
name: cloudflare-containers
description: Deploy and manage Docker containers on Cloudflare's global network alongside Workers. Use when building applications that need to run Python code, process large files (multi-GB zips, video transcoding), execute CLI tools, run AI inference, create code sandboxes, or any workload requiring more memory/CPU than Workers provide. Triggers include requests to run containers, execute arbitrary code, process large files, deploy backend services in Python/Go/Rust, or integrate heavyweight compute with Workers.
---

# Cloudflare Containers

Run containers globally with on-demand scaling, controlled by Workers code.

## When to Use Containers vs Workers

| Use Case                          | Solution                   |
| --------------------------------- | -------------------------- |
| Lightweight API, JS/TS logic      | Worker                     |
| Python/Go/Rust backend            | Container                  |
| Large file processing (multi-GB)  | Container                  |
| AI inference, ML models           | Container                  |
| Code sandbox execution            | Container (or Sandbox SDK) |
| CLI tools (FFmpeg, zip utilities) | Container                  |

## Quick Start

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/containers-template
npx wrangler deploy
```

First deploy takes 2-3 minutes. Check status: `npx wrangler containers list`

## Project Structure

```
my-container-app/
├── src/index.ts          # Worker entry point
├── container/
│   ├── Dockerfile        # Container image (must be linux/amd64)
│   └── app/              # Container application code
└── wrangler.jsonc        # Configuration
```

## Instance Types

Choose based on workload requirements. Larger instances cost more but handle heavier tasks.

| Type         | vCPU | Memory  | Disk  | Best For                                      |
| ------------ | ---- | ------- | ----- | --------------------------------------------- |
| `lite`       | 1/16 | 256 MiB | 2 GB  | Development, testing, minimal workloads       |
| `basic`      | 1/4  | 1 GiB   | 4 GB  | Light APIs, simple scripts                    |
| `standard-1` | 1/2  | 4 GiB   | 8 GB  | General purpose, most applications            |
| `standard-2` | 1    | 6 GiB   | 12 GB | Large files (1-5 GB), memory-intensive        |
| `standard-3` | 2    | 8 GiB   | 16 GB | CPU-intensive, parallel processing            |
| `standard-4` | 4    | 12 GiB  | 20 GB | Heavy workloads, multi-GB files, ML inference |

**Selection guidance:**

- Start with `standard-1` for most production workloads
- Use `standard-2`+ for file processing over 1 GB
- Use `standard-3`+ for CPU-bound tasks (video transcoding, compression)
- Use `lite` only for development to minimize costs

## Configuration (wrangler.jsonc)

```jsonc
{
  "name": "my-container-app",
  "main": "src/index.ts",
  "compatibility_date": "2025-11-14",
  "containers": [
    {
      "class_name": "MyContainer",
      "image": "./container/Dockerfile",
      "max_instances": 10,
      "instance_type": "standard-1",
    },
  ],
  "durable_objects": {
    "bindings": [{ "class_name": "MyContainer", "name": "MY_CONTAINER" }],
  },
  "migrations": [{ "new_sqlite_classes": ["MyContainer"], "tag": "v1" }],
}
```

## Worker ↔ Container Interaction

Containers are Durable Objects. Each container instance has a unique ID and maintains state until it sleeps.

### Container Class Definition

```typescript
import { Container } from "@cloudflare/containers";

export class MyContainer extends Container<Env> {
  // Port the container listens on (required)
  defaultPort = 8000;

  // Auto-sleep after idle period (optional, default: no sleep)
  sleepAfter = "10m";

  // Environment variables passed to container (optional)
  envVars = {
    LOG_LEVEL: "info",
    API_KEY: this.env.SOME_SECRET,
  };

  // Lifecycle hooks (optional)
  override onStart() {
    console.log("Container started");
  }
  override onStop() {
    console.log("Container stopped");
  }
  override onError(error: unknown) {
    console.error("Container error:", error);
  }
}
```

### Getting a Container Reference

Use `getContainer(binding, id)` to get a container stub. The `id` determines which instance handles the request.

```typescript
import { getContainer } from "@cloudflare/containers";

// Same ID = same container instance (stateful)
const container = getContainer(env.MY_CONTAINER, "user-123");

// Different IDs = different instances
const containerA = getContainer(env.MY_CONTAINER, "session-abc");
const containerB = getContainer(env.MY_CONTAINER, "session-xyz");
```

### Routing Patterns

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Pattern 1: Stateful - route by user/session ID
    // Same user always hits same container, preserving state
    if (url.pathname.startsWith("/user/")) {
      const userId = url.pathname.split("/")[2];
      const container = getContainer(env.MY_CONTAINER, userId);
      return container.fetch(request);
    }

    // Pattern 2: Stateless load balancing
    // Distribute across N container instances randomly
    if (url.pathname.startsWith("/api/")) {
      const instanceId = Math.floor(Math.random() * 5).toString();
      const container = getContainer(env.MY_CONTAINER, instanceId);
      return container.fetch(request);
    }

    // Pattern 3: Singleton - all requests to one container
    if (url.pathname === "/admin") {
      const container = getContainer(env.MY_CONTAINER, "admin");
      return container.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
```

### Making Requests to Containers

The container stub's `fetch()` method forwards requests to the container's HTTP server.

```typescript
// Forward the original request directly
const response = await container.fetch(request);

// Create a new request to a specific endpoint
const response = await container.fetch(
  new Request("http://container/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: "payload" }),
  }),
);

// The hostname in the URL doesn't matter - it routes to the container
// "http://container/..." and "http://localhost/..." both work
```

### Waiting for Container Readiness

Containers may need time to start. Check health before processing:

```typescript
async function waitForReady(container: ContainerStub, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await container.fetch("http://container/health");
      if (res.ok) return true;
    } catch {
      // Container not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Container failed to start");
}
```

## Sandbox SDK (Simpler Code Execution)

For pure code execution without custom containers:

```typescript
import { getSandbox, type Sandbox } from "@cloudflare/sandbox";

export { Sandbox } from "@cloudflare/sandbox";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const sandbox = getSandbox(env.Sandbox, "my-sandbox");

    const result = await sandbox.exec('python3 -c "print(2 + 2)"');
    await sandbox.writeFile("/workspace/data.txt", "Hello");
    const file = await sandbox.readFile("/workspace/data.txt");

    return Response.json({ output: result.stdout });
  },
};
```

## Key Behaviors

| Behavior      | Details                                      |
| ------------- | -------------------------------------------- |
| Cold start    | 2-3 seconds typical (depends on image size)  |
| Disk          | Ephemeral, resets on container restart       |
| Auto-sleep    | After `sleepAfter` timeout, container sleeps |
| Scale to zero | No charge when sleeping                      |
| Billing       | Per 10ms of active runtime                   |
| Architecture  | Must be `linux/amd64`                        |
| Shutdown      | SIGTERM sent, SIGKILL after 15 minutes       |

## Additional Resources

- **Full examples**: See [references/examples.md](references/examples.md) for Python executor, large file processor
- **R2 integration**: See [references/r2-integration.md](references/r2-integration.md) for S3 API and FUSE mount patterns

## Pricing (Workers Paid - $5/month)

| Resource | Included     | Overage            |
| -------- | ------------ | ------------------ |
| Memory   | 25 GiB-hours | $0.0000025/GiB-sec |
| CPU      | 375 vCPU-min | $0.000020/vCPU-sec |
| Disk     | 200 GB-hours | $0.00000007/GB-sec |

## Limits (Open Beta)

| Limit             | Value   |
| ----------------- | ------- |
| Concurrent memory | 400 GiB |
| Concurrent vCPU   | 100     |
| Concurrent disk   | 2 TB    |
