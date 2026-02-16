---
name: cloudflare-workflows
description: Build durable, multi-step applications on Cloudflare Workers. Use when implementing background jobs, long-running processes, multi-step pipelines, webhook coordinators, scheduled tasks, or any operation requiring automatic retries and state persistence. Triggers include mentions of Workflows, WorkflowEntrypoint, step.do, step.sleep, step.waitForEvent, durable execution, or orchestrating async operations on Cloudflare.
---

# Cloudflare Workflows

Workflows enable durable, multi-step applications that automatically retry failed steps, persist state across hibernation, and coordinate between services.

## Quick Start

```typescript
import type { env, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

type OrderParams = { orderId: string; userId: string };

export class OrderWorkflow extends WorkflowEntrypoint<typeof env, OrderParams> {
  async run(event: WorkflowEvent<OrderParams>, step: WorkflowStep) {
    // Dynamic import for database (required for proper connection handling)
    const { db } = await import("@/db");

    const user = await step.do("fetch-user", async () => {
      return await db
        .selectFrom("user")
        .where("id", "=", event.payload.userId)
        .executeTakeFirst();
    });

    if (!user) {
      throw new NonRetryableError("User not found");
    }

    await step.do(
      "process-order",
      {
        retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
        timeout: "2 minutes",
      },
      async () => {
        return await processOrder(event.payload.orderId);
      },
    );

    await step.sleep("wait-for-review-period", "24 hours");

    await step.do("send-confirmation", async () => {
      await sendEmail(user.email, "Order complete!");
    });

    return { status: "complete" };
  }
}
```

## Configuration

```toml
# wrangler.toml
[[workflows]]
name = "order-workflow"
binding = "MY_WORKFLOW"
class_name = "OrderWorkflow"
```

## Step Types

| Method                          | Purpose                 | Example                                                            |
| ------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| `step.do(name, fn)`             | Execute retriable code  | `await step.do('fetch-data', async () => fetch(...))`              |
| `step.sleep(name, duration)`    | Pause execution         | `await step.sleep('delay-retry', '1 hour')`                        |
| `step.sleepUntil(name, date)`   | Sleep to specific time  | `await step.sleepUntil('wait-for-launch', new Date('2025-01-01'))` |
| `step.waitForEvent(name, opts)` | Wait for external event | `await step.waitForEvent('receive-webhook', { type: 'payment' })`  |

### Retry Configuration

```typescript
await step.do(
  "call-external-api",
  {
    retries: { limit: 5, delay: "10 seconds", backoff: "exponential" },
    timeout: "5 minutes",
  },
  async () => {
    /* ... */
  },
);
```

### NonRetryableError

Import from `cloudflare:workflows` (not `cloudflare:workers`):

```typescript
import { NonRetryableError } from "cloudflare:workflows";

await step.do("validate-input", async () => {
  if (!isValid) throw new NonRetryableError("Invalid input");
});
```

## Triggering Workflows

Access workflow bindings via `this.env` inside the workflow, or `env` in fetch handlers:

```typescript
// From fetch handler
export default {
  async fetch(
    req: Request,
    env: typeof import("cloudflare:workers").env,
  ): Promise<Response> {
    // Create instance
    const instance = await env.MY_WORKFLOW.create({
      id: `order-${orderId}`, // Must be unique
      params: { orderId, userId },
    });

    // Get existing instance
    const existing = await env.MY_WORKFLOW.get(instanceId);
    return Response.json(await existing.status());
  },
};

// Instance methods
await instance.status(); // { status: 'running' | 'complete' | ... }
await instance.pause();
await instance.resume();
await instance.terminate();

// Send event to waiting instance
await instance.sendEvent({
  type: "payment-confirmed",
  payload: { status: "success" },
});

// Batch creation (use instead of loops)
await env.MY_WORKFLOW.createBatch([
  { id: "user-1", params: { name: "Alice" } },
  { id: "user-2", params: { name: "Bob" } },
]);
```

From inside a workflow, use `this.env`:

```typescript
// Trigger another workflow from within a workflow
const subInstance = await step.do("create-sub-workflow", async () => {
  return await this.env.OTHER_WORKFLOW.create({
    params: {
      /* ... */
    },
  });
});
```

## Critical Rules

These rules prevent subtle bugs that are hard to debug. Violations cause state loss or duplicate operations.

### 1. Steps Must Be Idempotent

Steps retry on failure—design for safe re-execution.

```typescript
// ✅ Check before mutating
await step.do("charge-customer", async () => {
  const sub = await getSubscription(id);
  if (sub.charged) return; // Already done
  await chargeCustomer(id);
});
```

### 2. Only Step Returns Persist

Workflows hibernate between steps. Variables outside steps are lost.

```typescript
// ❌ State lost on hibernation
let results = [];
await step.do("fetch-data", async () => {
  results.push(data);
});
await step.sleep("wait-period", "1 hour");
// results is empty here!

// ✅ Build state from step returns
const results = await Promise.all([
  step.do("fetch-item-1", () => getData(1)),
  step.do("fetch-item-2", () => getData(2)),
]);
```

### 3. No Side Effects Outside Steps

Code outside steps may run multiple times on replay.

```typescript
// ❌ Creates multiple instances on replay
const sub = await this.env.OTHER_WORKFLOW.create();
const random = Math.random();

// ✅ Wrap in steps
const sub = await step.do("create-sub-workflow", () =>
  this.env.OTHER_WORKFLOW.create(),
);
const random = await step.do("generate-random", () => Math.random());
```

### 4. Step Names Must Be Deterministic

Names act as cache keys. Non-deterministic names break replay. Use kebab-case.

```typescript
// ❌ Different name on each replay
await step.do(`step-${Date.now()}`, async () => {
  /* ... */
});

// ✅ Stable, descriptive names (kebab-case)
await step.do("process-payment", async () => {
  /* ... */
});

// ✅ Dynamic but deterministic (based on prior step output)
const items = await step.do("get-items", () => fetchItems());
for (const item of items) {
  await step.do(`process-item-${item.id}`, () => processItem(item));
}
```

### 5. Always Await Steps

```typescript
// ❌ Dangling promise causes race conditions
step.do("fetch-data", async () => {
  /* ... */
});

// ✅ Always await
await step.do("fetch-data", async () => {
  /* ... */
});
```

### 6. Use Unique Instance IDs

```typescript
// ❌ Reusing ID prevents multiple runs for same user
await env.MY_WORKFLOW.create({ id: userId });

// ✅ Composite ID or naturally unique (transactionId, orderId)
await env.MY_WORKFLOW.create({
  id: `${userId}-${crypto.randomUUID().slice(0, 6)}`,
});
```

### 7. Use createBatch for Multiple Instances

```typescript
// ❌ Individual creates hit rate limits
for (const user of users) {
  await env.MY_WORKFLOW.create({ id: user.id, params: user });
}

// ✅ Batch creation
await env.MY_WORKFLOW.createBatch(users.map((u) => ({ id: u.id, params: u })));
```

### 8. Wrap Promise.race in a Step

Race results may vary across restarts without step wrapping.

```typescript
// ✅ Consistent caching
const result = await step.do("race-fetches", async () => {
  return await Promise.race([fetchFast(), fetchSlow()]);
});
```

### 9. Use Dynamic Imports for Database Connections

Database connections should be established fresh in workflow context:

```typescript
export class MyWorkflow extends WorkflowEntrypoint<typeof env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    // ✅ Dynamic import at start of run()
    const { db } = await import("@/db");

    await step.do("query-database", async () => {
      return await db.selectFrom("users").execute();
    });
  }
}
```

## Common Patterns

### Webhook Coordination

```typescript
// Start workflow, wait for external webhook
const confirmation = await step.waitForEvent<{ status: string }>(
  "await-payment-webhook",
  {
    type: "payment-confirmed",
    timeout: "1 hour",
  },
);

// Webhook handler sends event
app.post("/webhook", async (req, env) => {
  const instance = await env.MY_WORKFLOW.get(req.body.orderId);
  await instance.sendEvent({ type: "payment-confirmed", payload: req.body });
});
```

### Scheduled Follow-up

```typescript
await step.do("send-welcome-email", () => sendEmail(user, "Welcome!"));
await step.sleep("wait-for-engagement", "7 days");
await step.do("send-followup-email", () =>
  sendEmail(user, "How are things going?"),
);
```

### Error Recovery

```typescript
try {
  await step.do("risky-operation", async () => {
    throw new NonRetryableError("failed");
  });
} catch (e) {
  await step.do("cleanup-after-failure", () => rollback());
}
// Workflow continues
await step.do("alternative-approach", () => alternativeApproach());
```

### Status Updates Pattern

Separate status update steps for UI synchronization:

```typescript
await step.do("update-status-processing", async () => {
  await updateJobStatus(db, jobId, {
    status: "processing",
    currentStep: "Validating input",
    progress: 20,
  });
  await triggerRealtimeUpdate(this.env.REALTIME_DO, jobId);
});

const result = await step.do(
  "process-data",
  {
    retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
    timeout: "5 minutes",
  },
  async () => {
    return await processData();
  },
);

await step.do("update-status-completed", async () => {
  await updateJobStatus(db, jobId, {
    status: "completed",
    progress: 100,
    completedAt: new Date().toISOString(),
  });
});
```

## References

- **Complete API reference**: See [references/api.md](references/api.md)
- **Full working examples**: See [references/examples.md](references/examples.md)
- [Cloudflare Docs: Workflows](https://developers.cloudflare.com/workflows/)
