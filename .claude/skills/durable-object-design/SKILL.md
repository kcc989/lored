# Durable Objects: Stub/RPC Pattern

## Overview

When working with Cloudflare Durable Objects, **always use the stub/RPC approach** rather than the legacy fetch/endpoint-based pattern. This skill explains why and how.

## The Two Approaches

### ❌ Legacy Approach: fetch() with Endpoints

```typescript
// DON'T DO THIS
export class MyDurableObject extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Route-based dispatch
    if (url.pathname === '/increment') {
      const count = await this.increment();
      return new Response(JSON.stringify({ count }));
    }

    if (url.pathname === '/get-value') {
      const value = await this.getValue();
      return new Response(JSON.stringify({ value }));
    }

    return new Response('Not found', { status: 404 });
  }

  private async increment() {
    /* ... */
  }
  private async getValue() {
    /* ... */
  }
}

// Worker calling the DO
const stub = env.MY_DO.get(id);
const response = await stub.fetch('https://fake-host/increment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ amount: 5 }),
});
const data = await response.json();
```

### ✅ Modern Approach: Stub with RPC

```typescript
// DO THIS INSTEAD
export class MyDurableObject extends DurableObject {
  // Public methods are automatically exposed as RPC methods
  async increment(amount: number = 1): Promise<number> {
    const current = (await this.ctx.storage.get<number>('count')) || 0;
    const newValue = current + amount;
    await this.ctx.storage.put('count', newValue);
    return newValue;
  }

  async getValue(): Promise<number> {
    return (await this.ctx.storage.get<number>('count')) || 0;
  }
}

// Worker calling the DO
const stub = env.MY_DO.get(id);
const count = await stub.increment(5); // Direct method call!
const value = await stub.getValue(); // So clean!
```

## Why Stub/RPC is Superior

### 1. **E-Order Semantics (Guaranteed Ordering)**

The stub approach guarantees that multiple calls to the same Durable Object are delivered in the order you make them. This is called **E-order semantics** and is critical for distributed programming.

```typescript
// With RPC stubs - guaranteed ordering
const stub = env.MY_DO.get(id);
stub.setValue('first'); // Will execute first
stub.setValue('second'); // Will execute second
stub.setValue('third'); // Will execute third
await stub.getValue(); // Will see 'third'
```

**Known Issue**: Mixing `fetch()` with RPC methods breaks E-order semantics. The `fetch()` method uses a different code path and ordering is NOT preserved:

```typescript
// ⚠️ ORDERING NOT GUARANTEED - fetch() breaks E-order
const stub = env.MY_DO.get(id);
stub.someMethod1(); // RPC call
stub.someMethod2(); // RPC call
return stub.fetch(request); // fetch() may execute out of order!
```

This is a documented issue ([workerd #2246](https://github.com/cloudflare/workerd/issues/2246)). Stick to pure RPC to maintain ordering guarantees.

### 2. **Natural JavaScript API**

RPC lets you call methods directly on the stub as if they were local:

```typescript
// RPC: Natural and intuitive
const user = await stub.getUser(userId);
await stub.updateProfile({ name: 'Alice' });
const stats = await stub.calculateStats();

// fetch(): Verbose and error-prone
const userResponse = await stub.fetch(`https://fake/users/${userId}`);
const user = await userResponse.json();

const updateResponse = await stub.fetch('https://fake/profile', {
  method: 'PUT',
  body: JSON.stringify({ name: 'Alice' }),
  headers: { 'Content-Type': 'application/json' },
});

const statsResponse = await stub.fetch('https://fake/stats');
const stats = await statsResponse.json();
```

### 3. **Type Safety**

With TypeScript, RPC stubs provide full type safety:

```typescript
export interface Env {
  MY_DO: DurableObjectNamespace<MyDurableObject>;
}

// TypeScript knows all available methods!
const stub = env.MY_DO.get(id);
const count = await stub.increment(5); // ✓ Type-checked
// await stub.nonExistent();            // ✗ Compile error!
```

### 4. **Zero-Latency Performance**

When RPC calls to a Durable Object in the same Worker thread, latency is nearly zero. The RPC system is built on Cap'n Proto and is incredibly efficient.

### 5. **Advanced Features**

RPC supports powerful features that HTTP fetch doesn't:

- **Streaming**: Automatic flow control for ReadableStream/WritableStream
- **Promise Pipelining**: Speculative calls on unresolved promises
- **Object Capabilities**: Security model built into the protocol
- **Bidirectional Communication**: Pass functions/callbacks that reverse caller/callee roles

```typescript
// Promise pipelining example
const userPromise = stub.getUser(userId);
// Don't await yet! Pipeline the next call
const postsPromise = userPromise.getPosts(); // Starts before userPromise resolves!
const posts = await postsPromise;
```

### 6. **Less Boilerplate**

No need to:

- Construct fake URLs
- Parse URL paths for routing
- Manually serialize/deserialize JSON
- Handle HTTP status codes
- Write request/response plumbing

## When You MUST Use fetch()

There are only a few legitimate cases for implementing `fetch()`:

1. **WebSocket connections**: `acceptWebSocket()` requires the fetch handler
2. **Legacy code**: Compatibility with existing projects (pre-2024-04-03 compatibility date)
3. **HTTP-specific needs**: When you genuinely need HTTP semantics (rare)

For WebSockets, you can still combine both patterns:

```typescript
export class MyDurableObject extends DurableObject {
  // RPC methods for regular calls
  async sendMessage(message: string) {
    /* ... */
  }
  async getHistory() {
    /* ... */
  }

  // fetch() only for WebSocket upgrade
  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, {
        status: 101,
        webSocket: pair[0],
      });
    }
    return new Response('Expected WebSocket', { status: 400 });
  }
}
```

## Migration Guide

If you have existing code using `fetch()`, here's how to migrate:

### Before (fetch-based)

```typescript
export class Counter extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/increment') {
      const body = await request.json();
      const count = await this.increment(body.amount);
      return Response.json({ count });
    }

    if (url.pathname === '/get') {
      const count = await this.getCount();
      return Response.json({ count });
    }

    return new Response('Not found', { status: 404 });
  }
}

// Calling from Worker
const response = await stub.fetch('https://fake/increment', {
  method: 'POST',
  body: JSON.stringify({ amount: 1 }),
});
const { count } = await response.json();
```

### After (RPC-based)

```typescript
export class Counter extends DurableObject {
  async increment(amount: number = 1): Promise<number> {
    const current = (await this.ctx.storage.get<number>('count')) || 0;
    const newCount = current + amount;
    await this.ctx.storage.put('count', newCount);
    return newCount;
  }

  async getCount(): Promise<number> {
    return (await this.ctx.storage.get<number>('count')) || 0;
  }
}

// Calling from Worker
const count = await stub.increment(1); // That's it!
```

## Best Practices

### 1. Public Methods Are RPC Methods

Any public method on your Durable Object class becomes an RPC method. Private methods are not exposed:

```typescript
export class MyDurableObject extends DurableObject {
  // ✓ Exposed via RPC
  async publicMethod() {}

  // ✗ Not exposed
  private async privateMethod() {}

  // ✗ Not exposed
  #privateFieldMethod() {}
}
```

### 2. Use Serializable Types

RPC parameters and return values must be serializable. Supported types:

- Primitives: `string`, `number`, `boolean`, `null`, `undefined`
- Objects and arrays (structured clone algorithm)
- `ReadableStream` / `WritableStream`
- `Request` / `Response`
- Functions (become RPC stubs for callbacks)
- Classes extending `RpcTarget` (become stubs)
- Other RPC stubs (can be forwarded)

```typescript
// ✓ Good
async updateUser(id: string, data: { name: string; age: number }) { }

// ✗ Bad - Map is not serializable
async updateCache(cache: Map<string, any>) { }

// ✓ Good - convert to object
async updateCache(cache: Record<string, any>) { }
```

### 3. Avoid Reserved Method Names

Don't use these names for RPC methods:

- `fetch` (special HTTP semantics)
- `connect` (reserved for future use)
- `dup` (reserved for stub duplication)
- `constructor` (JavaScript class semantics)

On `WorkerEntrypoint` and `DurableObject` (but allowed on `RpcTarget`):

- `alarm` (system event)
- `webSocketMessage` (system event)
- `webSocketClose` (system event)
- `webSocketError` (system event)

### 4. Handle Exceptions Properly

When a Durable Object throws an exception:

- All in-flight calls on that stub will fail
- Future calls on that stub will fail
- You must create a new stub to continue

```typescript
try {
  await stub.dangerousOperation();
} catch (error) {
  // This stub is now "poisoned"
  // Create a new one to continue
  const newStub = env.MY_DO.get(id);
  await newStub.retryOperation();
}
```

### 5. Constructor Changes

When extending `DurableObject`, the constructor signature changes:

```typescript
// Old (pre-RPC)
constructor(state: DurableObjectState, env: Env) {
  this.state = state;
  this.env = env;
}

// New (RPC)
constructor(ctx: DurableObjectState, env: Env) {
  super(ctx, env);  // Call super!
  // ctx and env are now available as this.ctx and this.env
}
```

Note: `state` is now called `ctx` when extending `DurableObject`.

## Common Patterns

### Pattern 1: Initialization

```typescript
export class MyDurableObject extends DurableObject {
  private value: number = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Block concurrent requests during initialization
    ctx.blockConcurrencyWhile(async () => {
      this.value = (await ctx.storage.get<number>('value')) || 0;
    });
  }

  async increment(): Promise<number> {
    this.value++;
    await this.ctx.storage.put('value', this.value);
    return this.value;
  }
}
```

### Pattern 2: Batching with E-Order

```typescript
// Take advantage of E-order to batch operations
const stub = env.MY_DO.get(id);

// These will execute in order, but we can fire them all at once
const promises = [stub.operation1(), stub.operation2(), stub.operation3()];

// Wait for all to complete
const results = await Promise.all(promises);
```

### Pattern 3: Stateful RPC with Callbacks

```typescript
export class MyDurableObject extends DurableObject {
  async subscribe(callback: (data: any) => void) {
    // Store the callback (it's an RPC stub!)
    // When events occur, call it back
    await this.ctx.storage.put('callback', callback);
  }

  async notifySubscribers(data: any) {
    const callback = await this.ctx.storage.get<Function>('callback');
    if (callback) {
      await callback(data); // Calls back to the original Worker!
    }
  }
}
```

## Debugging Tips

### Check Your Compatibility Date

RPC requires compatibility date `>= 2024-04-03`:

```toml
# wrangler.toml
compatibility_date = "2024-04-03"
```

### Use TypeScript for Better Errors

Define proper types for your Durable Object namespace:

```typescript
export interface Env {
  MY_DO: DurableObjectNamespace<MyDurableObject>;
}
```

### Log Method Calls

```typescript
export class MyDurableObject extends DurableObject {
  async myMethod(param: string) {
    console.log(`myMethod called with: ${param}`);
    // ... implementation
  }
}
```

## Summary

**Always use stub/RPC for Durable Objects unless you have a specific reason not to.**

Benefits:

- ✅ Guaranteed E-order execution semantics
- ✅ Natural, type-safe JavaScript API
- ✅ Zero-latency performance within same Worker
- ✅ Less code, fewer bugs
- ✅ Advanced features (streaming, pipelining, callbacks)
- ✅ Better security model (object capabilities)

Only use `fetch()` for:

- WebSocket upgrades
- Legacy compatibility
- Genuine HTTP-specific requirements

The RPC approach is the modern, recommended way to work with Durable Objects and should be your default choice for all new projects.
