# Cloudflare Workflows API Reference

## Imports

```typescript
// Types and base class from cloudflare:workers
import type { env, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";

// NonRetryableError from cloudflare:workflows (different module!)
import { NonRetryableError } from "cloudflare:workflows";
```

## WorkflowEntrypoint

Base class for all workflows. Use `typeof env` for environment typing:

```typescript
export class MyWorkflow extends WorkflowEntrypoint<typeof env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    // Dynamic import for database connections
    const { db } = await import("@/db");

    // Access bindings via this.env
    // Access params via event.payload
  }
}
```

## WorkflowEvent

```typescript
type WorkflowEvent<T> = {
  payload: Readonly<T>; // Custom params passed at creation
  timestamp: Date; // When instance was created
  instanceId: string; // Unique instance identifier
};
```

## Step Methods

### step.do(name, [config], fn)

Execute retriable code. Use kebab-case for step names.

```typescript
// Basic
const result = await step.do("fetch-data", async () => {
  return await fetch("https://api.example.com");
});

// With configuration
const result = await step.do(
  "call-external-api",
  {
    retries: {
      limit: 5, // Max attempts (use Infinity for unlimited)
      delay: "5 seconds", // Or number in ms
      backoff: "exponential", // 'constant' | 'linear' | 'exponential'
    },
    timeout: "15 minutes",
  },
  async () => {
    return await callExternalService();
  },
);
```

**Default retry config:**

- `limit`: 5
- `delay`: 10000ms (10 seconds)
- `backoff`: 'exponential'
- `timeout`: '10 minutes'

### step.sleep(name, duration)

Pause execution for a duration.

```typescript
// Human-readable duration
await step.sleep("wait-before-retry", "1 hour");
await step.sleep("delay-processing", "30 minutes");

// Milliseconds
await step.sleep("short-wait", 5000);

// Accepted units: second, minute, hour, day, week, month, year
```

### step.sleepUntil(name, date)

Sleep until a specific time.

```typescript
// Date object
await step.sleepUntil("wait-for-launch", new Date("2024-12-01T09:00:00Z"));

// Unix timestamp (milliseconds)
await step.sleepUntil("scheduled-task", Date.parse("2024-12-01T09:00:00Z"));
```

### step.waitForEvent(name, options)

Wait for an external event.

```typescript
const event = await step.waitForEvent<WebhookPayload>("receive-webhook", {
  type: "stripe-webhook", // Must match sendEvent type
  timeout: "1 hour", // Default: 24 hours
});

console.log(event.payload);
```

## Workflow Binding Methods

### create(options)

Create a new workflow instance.

```typescript
const instance = await env.MY_WORKFLOW.create({
  id: "optional-custom-id", // Auto-generated if omitted
  params: { key: "value" },
});

// ID constraints:
// - Max 100 characters
// - Pattern: ^[a-zA-Z0-9_][a-zA-Z0-9-_]*$
// - Must be unique
```

### createBatch(instances)

Create multiple instances efficiently.

```typescript
const instances = await env.MY_WORKFLOW.createBatch([
  { id: "user-1", params: { name: "Alice" } },
  { id: "user-2", params: { name: "Bob" } },
]);
```

### get(instanceId)

Retrieve an existing instance.

```typescript
const instance = await env.MY_WORKFLOW.get("instance-id");
```

## Instance Methods

### status()

Get current instance status.

```typescript
const status = await instance.status();

type InstanceStatus = {
  status:
    | "queued" // Waiting to start
    | "running" // Actively executing
    | "paused" // User paused
    | "errored" // Failed
    | "terminated" // User terminated
    | "complete" // Successfully finished
    | "waiting" // Sleeping or waiting for event
    | "waitingForPause" // Finishing current work to pause
    | "unknown";
  error?: string; // Error message if errored
  output?: object; // Return value from run()
};
```

### Control Methods

```typescript
await instance.pause(); // Pause after current step
await instance.resume(); // Resume paused instance
await instance.terminate(); // Stop immediately
await instance.restart(); // Restart from beginning
```

### sendEvent(event)

Send event to an instance waiting via `step.waitForEvent`.

```typescript
await instance.sendEvent({
  type: "payment-webhook", // Must match waitForEvent type
  payload: { status: "success" },
});
```

## NonRetryableError

Force immediate failure without retries. **Note: Import from `cloudflare:workflows`, not `cloudflare:workers`.**

```typescript
import { NonRetryableError } from "cloudflare:workflows";

await step.do("validate-input", async () => {
  if (!isValid) {
    throw new NonRetryableError("Invalid input - cannot proceed");
  }
});
```

## Configuration

### wrangler.toml

```toml
[[workflows]]
name = "my-workflow"
binding = "MY_WORKFLOW"
class_name = "MyWorkflow"

# Cross-worker binding (optional)
[[workflows]]
name = "billing-workflow"
binding = "BILLING"
class_name = "BillingWorkflow"
script_name = "billing-worker"
```

### wrangler.json

```json
{
  "workflows": [
    {
      "name": "my-workflow",
      "binding": "MY_WORKFLOW",
      "class_name": "MyWorkflow"
    }
  ]
}
```

## CLI Commands

```bash
# Trigger with payload
npx wrangler workflows trigger my-workflow '{"email":"user@example.com"}'

# Check instance status
npx wrangler workflows instances describe my-workflow latest
npx wrangler workflows instances describe my-workflow <instance-id>

# List workflows
npx wrangler workflows list

# Deploy
npx wrangler deploy
```

## Limits

- Instance IDs: max 100 characters, pattern `^[a-zA-Z0-9_][a-zA-Z0-9-_]*$`
- Step return values must be JSON-serializable (no Functions, Symbols, circular refs)
- `step.sleep` calls don't count toward step limits
- Only `running` instances count toward concurrency limits
