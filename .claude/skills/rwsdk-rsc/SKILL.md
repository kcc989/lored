---
name: rwsdk-rsc
description: "Guide for building applications with React Server Components (RSC) using RedwoodSDK (rwsdk). Use when working with rwsdk projects that need: (1) Server components for data fetching and rendering, (2) Client components for interactivity, (3) Server functions for form handling and mutations, (4) Suspense boundaries for loading states, (5) Context sharing across server components, or (6) Manual rendering with renderToStream/renderToString."
---

# React Server Components with rwsdk

## Core Concepts

rwsdk uses React Server Components by default. Components render on the server as HTML, then stream to the client.

### Server Components (Default)

Server components run on the server, have no client-side JavaScript, and can directly access databases and server resources.

```tsx
// No directive needed - server component by default
export default function MyServerComponent() {
  return <div>Hello, from the server!</div>;
}
```

**Capabilities:**

- Direct database access via `ctx`
- Async/await for data fetching
- No hydration cost
- Cannot use hooks (useState, useEffect, etc.)
- Cannot handle browser events

### Client Components

Add `"use client"` directive for interactivity. These hydrate in the browser.

```tsx
"use client";

export default function MyClientComponent() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Count: {count}</button>;
}
```

**Use client components when:**

- Handling clicks, input, or other browser events
- Using React hooks (useState, useEffect, useRef, etc.)
- Accessing browser APIs (localStorage, window, etc.)

## Data Fetching Pattern

Server components fetch data directly. Wrap async components in Suspense for loading states.

```tsx
// src/app/pages/todos/TodoPage.tsx
import { Suspense } from "react";

async function Todos({ ctx }) {
  const todos = await db.todo.findMany({ where: { userId: ctx.user.id } });
  return (
    <ol>
      {todos.map((todo) => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ol>
  );
}

export async function TodoPage({ ctx }) {
  return (
    <div>
      <h1>Todos</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <Todos ctx={ctx} />
      </Suspense>
    </div>
  );
}
```

**Key points:**

- Route components receive `ctx` object
- Pass `ctx` to child server components that need it
- Suspense boundaries show loading state during async operations
- We can import server functions from handlers and fetch data

## Server Functions

Execute server code from client components using the `"use server"` directive.

### Define Server Function

```tsx
// @/pages/todos/functions.tsx
"use server";

import { requestInfo } from "rwsdk/worker";

export async function addTodo(formData: FormData) {
  const { ctx } = requestInfo;
  const title = formData.get("title");
  await db.todo.create({ data: { title, userId: ctx.user.id } });
}
```

### Use in Client Component

```tsx
// @/pages/todos/AddTodo.tsx
"use client";

import { addTodo } from "./functions";

export default function AddTodo() {
  return (
    <form action={addTodo}>
      <input type="text" name="title" />
      <button type="submit">Add</button>
    </form>
  );
}
```

**How it works:**

1. Form submits from client
2. Form data sent to server
3. Server function executes
4. Result streams back, React updates view

## RSC vs API Calls: When to Use Each

### Use RSC Direct Data Access When:

- **Initial page render** — Data needed before the page displays
- **SEO-critical content** — Search engines see server-rendered HTML
- **Request-scoped data** — User-specific content that won't change during the session
- **Avoiding waterfalls** — Fetch data where it's needed, not in a parent component

```tsx
// Good: Direct DB access in server component
async function ProductPage({ ctx }) {
  const product = await db.product.findUnique({ where: { id: ctx.params.id } });
  return <ProductDetails product={product} />;
}
```

### Use Server Functions ("use server") When:

- **Mutations** — Create, update, delete operations
- **Form submissions** — Native form handling with progressive enhancement
- **User-triggered actions** — Button clicks that modify server state

```tsx
// Good: Server function for mutations
'use server';
export async function updateProduct(formData: FormData) {
  const { ctx } = requestInfo;
  await db.product.update({ where: { id: formData.get('id') }, data: { ... } });
}
```

### Use API Routes / fetch() When:

- **Polling or real-time updates** — Data that changes after initial render
- **Infinite scroll / pagination** — Loading more content client-side
- **Shared endpoints** — Same API consumed by web, mobile, or third parties
- **Client-side caching** — SWR/React Query patterns for stale-while-revalidate
- **Non-React consumers** — Webhooks, external services, CLI tools

```tsx
// API route for polling/shared access
// src/app/api/notifications/route.ts
export async function GET(request: Request) {
  const notifications = await db.notification.findMany({ ... });
  return Response.json(notifications);
}

// Client component polling
'use client';
function Notifications() {
  const [data, setData] = useState([]);
  useEffect(() => {
    const poll = () => fetch('/api/notifications').then(r => r.json()).then(setData);
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);
  return <NotificationList items={data} />;
}
```

### Decision Matrix

| Scenario                      | Approach         | Why                             |
| ----------------------------- | ---------------- | ------------------------------- |
| Show user's dashboard on load | RSC direct       | No JS needed, streams fast      |
| Submit a form                 | Server function  | Progressive enhancement, simple |
| Load more items on scroll     | API + fetch      | Client-initiated after render   |
| Real-time notifications       | API + polling/WS | Data changes post-render        |
| Mobile app needs same data    | API route        | Shared contract across clients  |
| Delete button click           | Server function  | Mutation from user action       |

### Anti-patterns to Avoid

❌ **Don't create API routes just to fetch in RSC** — Access DB directly

```tsx
// Bad: Unnecessary API hop
async function Page() {
  const res = await fetch("/api/products"); // Why?
  const products = await res.json();
}

// Good: Direct access
async function Page({ ctx }) {
  const products = await db.product.findMany();
}
```

❌ **Don't use RSC for frequently-changing data** — Use client-side fetching

```tsx
// Bad: Stock price in RSC (stale immediately)
async function StockTicker() {
  const price = await getStockPrice(); // Stale after render
  return <span>{price}</span>;
}

// Good: Client component with polling
("use client");
function StockTicker() {
  const { data } = useSWR("/api/stock", fetcher, { refreshInterval: 1000 });
  return <span>{data?.price}</span>;
}
```

## Context

Context shares data globally between server components per-request. Populated by middleware, accessible via:

- `ctx` prop in Page components
- `requestInfo.ctx` in server functions

## Manual Rendering

For advanced use cases, render components imperatively.

### renderToStream

Returns a `ReadableStream` that decodes to HTML.

```tsx
const stream = await renderToStream(<NotFound />, { Document });

const response = new Response(stream, {
  status: 404,
});
```

**Options:**

- `Document`: Wrapper component for the rendered element
- `injectRSCPayload = false`: Inject RSC payload for client hydration
- `onError`: Error callback during rendering

### renderToString

Returns an HTML string.

```tsx
const html = await renderToString(<NotFound />, { Document });

const response = new Response(html, {
  status: 404,
});
```

**Limitation:** `renderToStream` and `renderToString` generate HTML only. They don't handle Server Actions or client-side transitions. For fully interactive routes, use `render()` from `defineApp`.

## Component Decision Guide

| Need                | Component Type           | Directive                       |
| ------------------- | ------------------------ | ------------------------------- |
| Display data        | Server                   | (none)                          |
| Fetch from DB       | Server                   | (none)                          |
| Click handlers      | Client                   | `"use client"`                  |
| useState/useEffect  | Client                   | `"use client"`                  |
| Form submission     | Client + Server Function | `"use client"` + `"use server"` |
| Browser APIs        | Client                   | `"use client"`                  |
| Polling / real-time | Client + API route       | `"use client"` + fetch          |
| Shared external API | API route                | Route handler                   |

## File Organization

```
src/app/pages/todos/
├── TodoPage.tsx      # Server component (page)
├── AddTodo.tsx       # Client component
└── functions.tsx     # Server functions
```
