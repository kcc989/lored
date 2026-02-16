---
name: rwsdk-routing-middleware
description: Use when building rwsdk applications with route handling, middleware, authentication guards, layouts, error handling, HTTP method routing, context sharing, and type-safe link generation - covers defineApp, route patterns, interrupters, layout(), except(), and Documents
---

# rwsdk Routing & Middleware

rwsdk uses `defineApp()` to define request handling as an ordered array of middleware and route handlers. Routes match by pattern (static, parameter, wildcard), support HTTP method routing, and can use interrupters for authentication/validation. Processing is sequential and short-circuits when any handler returns a Response.

## Quick Start

```typescript
import { defineApp } from "rwsdk/worker";
import { route, render, layout, except } from "rwsdk/router";

export default defineApp([
  // Error handler (catches errors in routes below)
  except((error) => <ErrorPage error={error} />),

  // Middleware (runs before routing)
  sessionMiddleware,
  getUserMiddleware,

  // Routes wrapped in Document + Layout
  render(Document, [
    layout(AppLayout, [
      route("/", HomePage),
      route("/admin", [isAuthenticated, isAdmin, AdminPage]),
      route("/users/:id", UserProfilePage),
    ]),
  ]),
]);
```

**Execution order**: Error handler registered → Middleware → Route matching → Interrupters → Handler → Layout wrapping → Document wrapping

## Route Matching

Routes match in definition order (first match wins). Trailing slashes normalized.

- **Static**: `route("/about", ...)` — exact match
- **Parameter**: `route("/users/:id", ...)` — access via `params.id`
- **Multi-param**: `route("/users/:id/groups/:groupId", ...)` — `params.id`, `params.groupId`
- **Wildcard**: `route("/files/*", ...)` — `params.$0` captures remaining path
- **Complex wildcard**: `route("/files/*/preview", ...)` — `params.$0` = segment before `/preview`

## Request Handlers

Handlers return either a `Response` or JSX (streamed as RSC):

```typescript
// Response object
route("/api/users", ({ request, params, ctx }) => {
  return new Response(JSON.stringify(users), {
    headers: { "Content-Type": "application/json" },
  });
});

// JSX (React Server Components, streamed)
route("/profile/:id", ({ params }) => <UserProfile userId={params.id} />);
```

## HTTP Method Routing

```typescript
route("/api/users", {
  get: () => new Response(JSON.stringify(users)),
  post: ({ request }) => new Response("Created", { status: 201 }),
  delete: () => new Response("Deleted", { status: 204 }),
  custom: { report: () => new Response("Report") }, // Custom methods
});
```

OPTIONS returns `204 No Content` with `Allow` header. Unsupported methods return `405`. Disable with `config: { disableOptions: true, disable405: true }`.

Per-method interrupters:

```typescript
route("/api/users", {
  get: [isAuthenticated, () => new Response(JSON.stringify(users))],
  post: [isAuthenticated, isAdmin, validateUser, createUserHandler],
});
```

## Interrupters (Guards)

Array of functions executed in sequence. Return a Response to short-circuit:

```typescript
function isAuthenticated({ ctx }) {
  if (!ctx.user) return new Response("Unauthorized", { status: 401 });
  // Return nothing to continue
}

function isAdmin({ ctx }) {
  if (ctx.user.role !== "admin")
    return new Response("Forbidden", { status: 403 });
}

defineApp([
  route("/admin", [isAuthenticated, isAdmin, AdminDashboard]),
  route("/profile", [isAuthenticated, UserProfile]),
]);
```

## Middleware & Context

Middleware runs **before route matching** and populates the shared `ctx` object:

```typescript
defineApp([
  async function sessionMiddleware({ request, ctx }) {
    ctx.session = await getSession(request);
  },
  async function getUserMiddleware({ ctx }) {
    if (ctx.session?.userId) {
      ctx.user = await db.selectFrom("users").where("id", "=", ctx.session.userId).selectAll().executeTakeFirst();
    }
  },
  route("/dashboard", ({ ctx }) => <Dashboard user={ctx.user} />),
]);
```

**Note**: Server Actions also pass through middleware, ensuring consistent context population.

## Layouts

`layout()` wraps routes with shared UI. Supports nesting:

```typescript
import { layout, route, render } from "rwsdk/router";
import type { LayoutProps } from "rwsdk/router";

function AppLayout({ children, requestInfo }: LayoutProps) {
  return (
    <div className="app">
      <header><nav>...</nav></header>
      <main>{children}</main>
      <footer>© 2025</footer>
    </div>
  );
}

function AdminLayout({ children }: LayoutProps) {
  "use client";
  return (
    <div className="admin">
      <aside>Sidebar</aside>
      <div>{children}</div>
    </div>
  );
}

defineApp([
  render(Document, [
    layout(AppLayout, [
      route("/", HomePage),
      prefix("/admin", [
        layout(AdminLayout, [
          route("/", AdminDashboard),
          route("/users", UserManagement),
        ]),
      ]),
    ]),
  ]),
]);
```

**Layout props**: `children` (wrapped content), `requestInfo` (only for server components—auto-detected).

**Nesting**: `layout(Outer, [layout(Inner, [route(...)])])` → `<Outer><Inner>...</Inner></Outer>`

**Composition**: Works with `prefix()`, `render()`, `route()`:

```typescript
prefix("/api", layout(ApiLayout, routes)); // ✅
layout(AppLayout, prefix("/admin", routes)); // ✅
render(Document, layout(AppLayout, routes)); // ✅
```

## Documents

Documents define the HTML shell (`<html>`, `<head>`, `<body>`):

```typescript
import { render } from "rwsdk/router";

const Document = ({ children }) => (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <script type="module" src="/src/client.tsx"></script>
    </head>
    <body>
      <div id="root">{children}</div>
    </body>
  </html>
);

defineApp([render(Document, [route("/", HomePage)])]);
```

**Important**: Include client hydration script. Document applies to all nested routes.

## Error Handling

### Server-Side: `except()`

Catches errors in Server Components, middleware, route handlers, and RSC actions:

```typescript
import { except, route } from "rwsdk/router";

defineApp([
  except((error) => {
    console.error("Server error:", error);
    return <ErrorPage error={error} />;
  }),
  route("/", HomePage),
]);
```

With monitoring (use `ctx.waitUntil` for async operations):

```typescript
except(async (error, { request, cf: ctx }) => {
  ctx.waitUntil(sendToMonitoring(error, { url: request.url }));
  return <ErrorPage error={error} />;
});
```

Nested error handling for different sections:

```typescript
defineApp([
  except((error) => <GlobalErrorPage error={error} />),

  prefix("/api", [
    except((error) => Response.json({ error: error.message }, { status: 500 })),
    route("/users", async () => { throw new Error("DB error"); }),
  ]),

  route("/", HomePage),
]);
```

### Client-Side: `initClient` Error Handlers

Configure via `hydrateRootOptions`:

```typescript
// src/client.tsx
import { initClient } from "rwsdk/client";

initClient({
  hydrateRootOptions: {
    onUncaughtError: (error, errorInfo) => {
      console.error("Uncaught:", error, errorInfo.componentStack);
      sendToMonitoring(error, errorInfo);
    },
    onCaughtError: (error, errorInfo) => {
      console.error("Caught by boundary:", error, errorInfo.componentStack);
    },
  },
});
```

**Universal error handling** (includes event handlers, timeouts, promise rejections):

```typescript
const redirectToError = () => window.location.replace("/error");

window.addEventListener("error", (e) => {
  console.error(e.message);
  redirectToError();
});
window.addEventListener("unhandledrejection", (e) => {
  console.error(e.reason);
  redirectToError();
});

initClient({
  hydrateRootOptions: {
    onUncaughtError: (error) => redirectToError(),
    onCaughtError: (error) => redirectToError(),
  },
});
```

**Note**: Traditional error boundaries force client components, defeating RSC benefits. Prefer root-level handlers.

## Request Info

Access request/response in server functions:

```typescript
import { requestInfo } from "rwsdk/worker";

export async function myServerFunction() {
  const { request, response, ctx, cf } = requestInfo;

  response.status = 404;
  response.headers.set("Cache-Control", "no-store");

  return <NotFound />;
}
```

Properties: `request` (HTTP Request), `response` (ResponseInit—mutate for status/headers), `ctx` (app context), `rw` (rwsdk context), `cf` (Cloudflare execution context).

## Type-Safe Links

```typescript
// src/lib/links.ts
import { linkFor } from "rwsdk/router";
type App = typeof import("../../worker").default;
export const link = linkFor<App>();

// Usage
link("/"); // Static
link("/users/:id", { id: "123" }); // Dynamic—TypeScript verifies params
link("/users/:id/edit", { id: userId }); // Autocomplete for all routes
```

Type-only import ensures no worker code in client bundles.

When using `ExportedHandler` (Cron, Queues):

```typescript
export const app = defineApp([...]);
export default { fetch: app.fetch } satisfies ExportedHandler<Env>;

// links.ts
type App = typeof Worker.app; // Note: .app not .default
```

## Prefetching

With `initClientNavigation`, hint future navigations:

```tsx
<link rel="x-prefetch" href={link("/about/")} />
```

Redwood issues background GET requests with `__rsc` query param, caches responses. Cache auto-evicts after navigation.

## Common Mistakes

| Mistake                        | Fix                                                       |
| ------------------------------ | --------------------------------------------------------- |
| Routes in wrong order          | Specific before wildcards: `/users/:id` before `/users/*` |
| Missing return in interrupters | `return new Response(...)` to short-circuit               |
| Middleware after routes        | Middleware must come before routes in array               |
| Mutating request object        | Request immutable—use `ctx` for shared state              |
| Wrong params access            | `params.id` not `request.params.id`                       |
| Not awaiting async middleware  | Mark as `async` if using await                            |
| `except` after routes          | Place `except` before routes it should catch              |

## Quick Reference

| Task            | Code                                    |
| --------------- | --------------------------------------- |
| Define app      | `defineApp([...middleware, ...routes])` |
| Static route    | `route("/path", handler)`               |
| Dynamic route   | `route("/users/:id", handler)`          |
| Wildcard        | `route("/files/*", handler)`            |
| HTTP methods    | `route("/api", { get, post, delete })`  |
| Guard route     | `route("/admin", [isAuth, handler])`    |
| Layout          | `layout(LayoutComponent, [routes])`     |
| Document        | `render(Document, [routes])`            |
| Error handler   | `except((error) => <ErrorPage />)`      |
| Type-safe links | `link("/users/:id", { id: "123" })`     |
| Mutate response | `requestInfo.response.status = 404`     |
