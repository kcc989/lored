# Container Examples

## Claude Agent Service

A container running the Claude Agent SDK that processes AI agent queries via HTTP. Supports streaming responses and custom tools.

### Dockerfile

```dockerfile
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

EXPOSE 8000
CMD ["node", "dist/server.js"]
```

### container/package.json

```json
{
  "name": "claude-agent-container",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  }
}
```

### container/src/server.ts

```typescript
import { createServer } from "node:http";
import {
  query,
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const PORT = 8000;

// Custom tools for the agent
const customTools = createSdkMcpServer({
  name: "container-tools",
  version: "1.0.0",
  tools: [
    tool(
      "fetch_url",
      "Fetch content from a URL",
      {
        url: z.string().url(),
        method: z.enum(["GET", "POST"]).default("GET"),
      },
      async (args) => {
        const response = await fetch(args.url, { method: args.method });
        const text = await response.text();
        return {
          content: [{ type: "text", text: text.slice(0, 10000) }],
        };
      },
    ),
    tool(
      "calculate",
      "Perform mathematical calculations",
      {
        expression: z.string(),
      },
      async (args) => {
        const result = Function(`"use strict"; return (${args.expression})`)();
        return {
          content: [{ type: "text", text: String(result) }],
        };
      },
    ),
  ],
});

async function handleQuery(req: Request): Promise<Response> {
  const body = await req.json();
  const { prompt, options = {} } = body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = query({
          prompt,
          options: {
            model: options.model || "claude-sonnet-4-5",
            mcpServers: { tools: customTools },
            ...options,
          },
        });

        for await (const message of response) {
          const chunk = JSON.stringify(message) + "\n";
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (error) {
        const errorMsg = JSON.stringify({
          type: "error",
          content: error instanceof Error ? error.message : "Unknown error",
        });
        controller.enqueue(encoder.encode(errorMsg + "\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
    },
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  if (url.pathname === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (url.pathname === "/query" && req.method === "POST") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString();
    const request = new Request(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    const response = await handleQuery(request);
    res.writeHead(200, Object.fromEntries(response.headers));

    const reader = response.body!.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Claude Agent container listening on port ${PORT}`);
});
```

### Worker (src/index.ts)

```typescript
import { Container, getContainer } from "@cloudflare/containers";

export class ClaudeAgent extends Container<Env> {
  defaultPort = 8000;
  sleepAfter = "15m";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/query" && request.method === "POST") {
      const container = getContainer(env.CLAUDE_AGENT, "shared");
      return container.fetch(
        new Request("http://container/query", {
          method: "POST",
          headers: request.headers,
          body: request.body,
        }),
      );
    }

    return new Response("POST /query with {prompt: string, options?: object}", {
      status: 400,
    });
  },
};
```

### wrangler.jsonc

```jsonc
{
  "name": "claude-agent",
  "main": "src/index.ts",
  "compatibility_date": "2025-11-14",
  "containers": [
    {
      "class_name": "ClaudeAgent",
      "image": "./container/Dockerfile",
      "max_instances": 10,
      "instance_type": "standard-2",
    },
  ],
  "durable_objects": {
    "bindings": [{ "class_name": "ClaudeAgent", "name": "CLAUDE_AGENT" }],
  },
  "migrations": [{ "new_sqlite_classes": ["ClaudeAgent"], "tag": "v1" }],
}
```

---

## Multi-Agent Code Review System

A container running specialized Claude agents for code analysis with parallel subagent orchestration.

### container/src/server.ts

```typescript
import { createServer } from "node:http";
import { query } from "@anthropic-ai/claude-agent-sdk";

const PORT = 8000;

interface ReviewRequest {
  code: string;
  language: string;
  reviewTypes?: ("security" | "performance" | "style")[];
}

async function handleCodeReview(req: Request): Promise<Response> {
  const body: ReviewRequest = await req.json();
  const {
    code,
    language,
    reviewTypes = ["security", "performance", "style"],
  } = body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const response = query({
        prompt: `Review this ${language} code for ${reviewTypes.join(", ")} issues:\n\n\`\`\`${language}\n${code}\n\`\`\``,
        options: {
          model: "claude-sonnet-4-5",
          agents: {
            "security-reviewer": {
              description: "Security vulnerability analysis expert",
              prompt: `You are a security expert. Focus on:
- Injection vulnerabilities (SQL, XSS, command)
- Authentication/authorization issues
- Data exposure risks
- Insecure dependencies
Provide severity ratings and fixes.`,
              tools: [],
              model: "sonnet",
            },
            "performance-analyst": {
              description: "Performance optimization specialist",
              prompt: `You are a performance expert. Analyze:
- Algorithm complexity
- Memory usage patterns
- Caching opportunities
- Resource bottlenecks
Provide specific optimization suggestions.`,
              tools: [],
              model: "haiku",
            },
            "style-reviewer": {
              description: "Code quality and style expert",
              prompt: `You are a code quality expert. Review:
- Code readability
- Design patterns
- SOLID principles
- Documentation quality
Suggest refactoring improvements.`,
              tools: [],
              model: "haiku",
            },
          },
        },
      });

      for await (const message of response) {
        if (message.type === "assistant" || message.type === "system") {
          const chunk = JSON.stringify(message) + "\n";
          controller.enqueue(encoder.encode(chunk));
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (url.pathname === "/review" && req.method === "POST") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();

    const request = new Request(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    const response = await handleCodeReview(request);
    res.writeHead(200, Object.fromEntries(response.headers));

    const reader = response.body!.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT);
```

### Worker (src/index.ts)

```typescript
import { Container, getContainer } from "@cloudflare/containers";

export class CodeReviewer extends Container<Env> {
  defaultPort = 8000;
  sleepAfter = "20m";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response(
        "POST /review with {code: string, language: string}",
        { status: 400 },
      );
    }

    const container = getContainer(env.CODE_REVIEWER, "shared");
    return container.fetch(
      new Request("http://container/review", {
        method: "POST",
        headers: request.headers,
        body: request.body,
      }),
    );
  },
};
```

### wrangler.jsonc

```jsonc
{
  "name": "code-reviewer",
  "main": "src/index.ts",
  "compatibility_date": "2025-11-14",
  "containers": [
    {
      "class_name": "CodeReviewer",
      "image": "./container/Dockerfile",
      "max_instances": 5,
      "instance_type": "standard-2",
    },
  ],
  "durable_objects": {
    "bindings": [{ "class_name": "CodeReviewer", "name": "CODE_REVIEWER" }],
  },
  "migrations": [{ "new_sqlite_classes": ["CodeReviewer"], "tag": "v1" }],
}
```

---

## Agent with MCP Server Integration

A container that connects the Claude Agent SDK to external MCP servers for enhanced capabilities.

### container/src/server.ts

```typescript
import { createServer } from "node:http";
import {
  query,
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const PORT = 8000;

// Database tools MCP server
const databaseTools = createSdkMcpServer({
  name: "database",
  version: "1.0.0",
  tools: [
    tool(
      "query_db",
      "Execute a read-only SQL query",
      {
        sql: z.string(),
        params: z.array(z.unknown()).optional(),
      },
      async (args) => {
        // Connect to your database here
        // This is a placeholder - use your actual DB client
        const results = [{ id: 1, name: "Example" }];
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      },
    ),
    tool("list_tables", "List all database tables", {}, async () => {
      const tables = ["users", "orders", "products"];
      return {
        content: [{ type: "text", text: tables.join("\n") }],
      };
    }),
  ],
});

// External API tools MCP server
const apiTools = createSdkMcpServer({
  name: "external-apis",
  version: "1.0.0",
  tools: [
    tool(
      "search_web",
      "Search the web for information",
      {
        query: z.string(),
        limit: z.number().min(1).max(10).default(5),
      },
      async (args) => {
        // Integrate with a search API
        const response = await fetch(
          `https://api.search.example.com?q=${encodeURIComponent(args.query)}&limit=${args.limit}`,
        );
        const data = await response.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      },
    ),
    tool(
      "send_notification",
      "Send a notification to a user",
      {
        userId: z.string(),
        message: z.string(),
        channel: z.enum(["email", "slack", "sms"]).default("email"),
      },
      async (args) => {
        // Integrate with notification service
        console.log(
          `Sending ${args.channel} to ${args.userId}: ${args.message}`,
        );
        return {
          content: [
            { type: "text", text: `Notification sent via ${args.channel}` },
          ],
        };
      },
    ),
  ],
});

async function handleAgentQuery(req: Request): Promise<Response> {
  const { prompt, context } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const response = query({
        prompt,
        options: {
          model: "claude-sonnet-4-5",
          mcpServers: {
            database: databaseTools,
            apis: apiTools,
          },
          allowedTools: [
            "mcp__database__query_db",
            "mcp__database__list_tables",
            "mcp__apis__search_web",
            "mcp__apis__send_notification",
          ],
          systemPrompt: context
            ? `Context: ${context}\n\nYou have access to database and external API tools.`
            : undefined,
        },
      });

      for await (const message of response) {
        controller.enqueue(encoder.encode(JSON.stringify(message) + "\n"));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (url.pathname === "/agent" && req.method === "POST") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);

    const request = new Request(url, {
      method: "POST",
      body: Buffer.concat(chunks).toString(),
      headers: { "Content-Type": "application/json" },
    });

    const response = await handleAgentQuery(request);
    res.writeHead(200, Object.fromEntries(response.headers));

    const reader = response.body!.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT);
```

### Worker (src/index.ts)

```typescript
import { Container, getContainer } from "@cloudflare/containers";

export class AgentService extends Container<Env> {
  defaultPort = 8000;
  sleepAfter = "30m";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/agent" && request.method === "POST") {
      // Use user ID for per-user container isolation
      const userId = request.headers.get("X-User-ID") || "anonymous";
      const container = getContainer(env.AGENT_SERVICE, userId);

      return container.fetch(
        new Request("http://container/agent", {
          method: "POST",
          headers: request.headers,
          body: request.body,
        }),
      );
    }

    return new Response("POST /agent with {prompt: string, context?: string}", {
      status: 400,
    });
  },
};
```

### wrangler.jsonc

```jsonc
{
  "name": "agent-service",
  "main": "src/index.ts",
  "compatibility_date": "2025-11-14",
  "containers": [
    {
      "class_name": "AgentService",
      "image": "./container/Dockerfile",
      "max_instances": 20,
      "instance_type": "standard-2",
    },
  ],
  "durable_objects": {
    "bindings": [{ "class_name": "AgentService", "name": "AGENT_SERVICE" }],
  },
  "migrations": [{ "new_sqlite_classes": ["AgentService"], "tag": "v1" }],
}
```

---

## Stateful Conversation Agent

A container that maintains conversation state across requests using Durable Object storage.

### container/src/server.ts

```typescript
import { createServer } from "node:http";
import { query } from "@anthropic-ai/claude-agent-sdk";

const PORT = 8000;

// In-memory conversation store (use Redis/DB in production)
const conversations = new Map<
  string,
  Array<{ role: string; content: string }>
>();

interface ChatRequest {
  conversationId: string;
  message: string;
}

async function handleChat(req: Request): Promise<Response> {
  const { conversationId, message }: ChatRequest = await req.json();

  // Get or create conversation history
  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, []);
  }
  const history = conversations.get(conversationId)!;

  // Add user message
  history.push({ role: "user", content: message });

  const encoder = new TextEncoder();
  let assistantResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      const response = query({
        prompt: message,
        options: {
          model: "claude-sonnet-4-5",
          // Pass conversation history as context
          systemPrompt:
            history.length > 1
              ? `Previous conversation:\n${history
                  .slice(0, -1)
                  .map((m) => `${m.role}: ${m.content}`)
                  .join("\n")}`
              : undefined,
        },
      });

      for await (const msg of response) {
        if (msg.type === "assistant") {
          assistantResponse += msg.content;
        }
        controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n"));
      }

      // Store assistant response
      history.push({ role: "assistant", content: assistantResponse });

      // Keep last 20 messages
      if (history.length > 20) {
        history.splice(0, history.length - 20);
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

async function handleClear(req: Request): Promise<Response> {
  const { conversationId } = await req.json();
  conversations.delete(conversationId);
  return new Response(JSON.stringify({ cleared: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString();

  if (url.pathname === "/chat" && req.method === "POST") {
    const request = new Request(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    const response = await handleChat(request);
    res.writeHead(200, Object.fromEntries(response.headers));

    const reader = response.body!.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
    return;
  }

  if (url.pathname === "/clear" && req.method === "POST") {
    const request = new Request(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    const response = await handleClear(request);
    res.writeHead(200, Object.fromEntries(response.headers));
    res.end(await response.text());
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT);
```

### Worker (src/index.ts)

```typescript
import { Container, getContainer } from "@cloudflare/containers";

export class ChatAgent extends Container<Env> {
  defaultPort = 8000;
  sleepAfter = "60m"; // Keep alive longer for ongoing conversations
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const body = await request
      .clone()
      .json()
      .catch(() => ({}));
    const conversationId = body.conversationId || "default";

    // Route to same container for same conversation
    const container = getContainer(env.CHAT_AGENT, conversationId);

    if (url.pathname === "/chat" && request.method === "POST") {
      return container.fetch(
        new Request("http://container/chat", {
          method: "POST",
          headers: request.headers,
          body: request.body,
        }),
      );
    }

    if (url.pathname === "/clear" && request.method === "POST") {
      return container.fetch(
        new Request("http://container/clear", {
          method: "POST",
          headers: request.headers,
          body: request.body,
        }),
      );
    }

    return new Response(
      "POST /chat with {conversationId: string, message: string}",
      { status: 400 },
    );
  },
};
```

### wrangler.jsonc

```jsonc
{
  "name": "chat-agent",
  "main": "src/index.ts",
  "compatibility_date": "2025-11-14",
  "containers": [
    {
      "class_name": "ChatAgent",
      "image": "./container/Dockerfile",
      "max_instances": 50,
      "instance_type": "standard-1",
    },
  ],
  "durable_objects": {
    "bindings": [{ "class_name": "ChatAgent", "name": "CHAT_AGENT" }],
  },
  "migrations": [{ "new_sqlite_classes": ["ChatAgent"], "tag": "v1" }],
}
```
