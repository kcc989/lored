# Cloudflare Workflows Examples

## E-commerce Order Processing

Complete order workflow with payment, webhook coordination, and follow-up emails.

```typescript
import type { env, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

type OrderParams = {
  orderId: string;
  userId: string;
  amount: number;
};

export class OrderWorkflow extends WorkflowEntrypoint<typeof env, OrderParams> {
  async run(event: WorkflowEvent<OrderParams>, step: WorkflowStep) {
    const { orderId, userId, amount } = event.payload;

    // Dynamic import for database
    const { db } = await import("@/db");

    // Step 1: Validate order
    const user = await step.do("validate-user", async () => {
      const userData = await db
        .selectFrom("user")
        .selectAll()
        .where("id", "=", userId)
        .executeTakeFirst();

      if (!userData) {
        throw new NonRetryableError("User not found");
      }
      return userData;
    });

    // Step 2: Process payment with retries
    const payment = await step.do(
      "process-payment",
      {
        retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
        timeout: "5 minutes",
      },
      async () => {
        return await processPayment(userId, amount);
      },
    );

    // Step 3: Wait for webhook confirmation
    const confirmation = await step.waitForEvent<{ status: string }>(
      "await-payment-confirmation",
      { type: "payment-webhook", timeout: "1 hour" },
    );

    if (confirmation.payload.status !== "success") {
      throw new NonRetryableError("Payment failed");
    }

    // Step 4: Send confirmation email
    await step.do("send-confirmation", async () => {
      await sendEmail(user.email, `Order ${orderId} confirmed!`);
    });

    // Step 5: Schedule follow-up
    await step.sleep("wait-for-feedback-window", "7 days");

    await step.do("send-feedback-request", async () => {
      await sendEmail(user.email, "How was your order?");
    });

    return { orderId, status: "complete" };
  }
}

// HTTP handler
export default {
  async fetch(
    req: Request,
    env: typeof import("cloudflare:workers").env,
  ): Promise<Response> {
    const url = new URL(req.url);

    // Create order
    if (req.method === "POST" && url.pathname === "/orders") {
      const body = await req.json<OrderParams>();
      const instance = await env.ORDER_WORKFLOW.create({
        id: body.orderId,
        params: body,
      });
      return Response.json({ instanceId: instance.id });
    }

    // Check status
    if (
      url.pathname.startsWith("/orders/") &&
      url.pathname.endsWith("/status")
    ) {
      const orderId = url.pathname.split("/")[2];
      const instance = await env.ORDER_WORKFLOW.get(orderId);
      return Response.json(await instance.status());
    }

    // Receive webhook
    if (req.method === "POST" && url.pathname === "/webhooks/payment") {
      const payload = await req.json();
      const instance = await env.ORDER_WORKFLOW.get(payload.orderId);
      await instance.sendEvent({
        type: "payment-webhook",
        payload: { status: payload.status },
      });
      return new Response("OK");
    }

    return new Response("Not Found", { status: 404 });
  },
};
```

## File Processing Pipeline

Process uploaded files through multiple stages.

```typescript
import type { env, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

type FileParams = {
  fileId: string;
  bucket: string;
};

export class FileProcessingWorkflow extends WorkflowEntrypoint<
  typeof env,
  FileParams
> {
  async run(event: WorkflowEvent<FileParams>, step: WorkflowStep) {
    const { fileId, bucket } = event.payload;

    // Download file
    const fileData = await step.do("download-file", async () => {
      const obj = await this.env.R2.get(`${bucket}/${fileId}`);
      return await obj?.arrayBuffer();
    });

    if (!fileData) {
      throw new NonRetryableError("File not found");
    }

    // Generate thumbnail
    const thumbnail = await step.do("generate-thumbnail", async () => {
      return await generateThumbnail(fileData);
    });

    // Create embeddings
    const embeddings = await step.do(
      "create-embeddings",
      {
        timeout: "10 minutes",
      },
      async () => {
        return await this.env.AI.run("@cf/baai/bge-base-en-v1.5", {
          text: extractText(fileData),
        });
      },
    );

    // Store results in parallel
    await Promise.all([
      step.do("store-thumbnail", async () => {
        await this.env.R2.put(`thumbnails/${fileId}`, thumbnail);
      }),
      step.do("store-embeddings", async () => {
        await this.env.VECTORIZE.insert([
          {
            id: fileId,
            values: embeddings.data[0],
          },
        ]);
      }),
    ]);

    return { fileId, processed: true };
  }
}
```

## User Onboarding Sequence

Drip campaign with conditional logic.

```typescript
import type { env, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";

type OnboardingParams = {
  userId: string;
  email: string;
  plan: "free" | "pro";
};

export class OnboardingWorkflow extends WorkflowEntrypoint<
  typeof env,
  OnboardingParams
> {
  async run(event: WorkflowEvent<OnboardingParams>, step: WorkflowStep) {
    const { userId, email, plan } = event.payload;
    const { db } = await import("@/db");

    // Welcome email immediately
    await step.do("send-welcome", async () => {
      await sendEmail(email, "Welcome to our platform!");
    });

    // Wait 1 day
    await step.sleep("day-1-wait", "1 day");

    // Check if user completed setup
    const setupComplete = await step.do("check-setup", async () => {
      const user = await db
        .selectFrom("user")
        .select("setupComplete")
        .where("id", "=", userId)
        .executeTakeFirst();
      return user?.setupComplete ?? false;
    });

    if (!setupComplete) {
      await step.do("send-setup-reminder", async () => {
        await sendEmail(email, "Complete your setup to get started");
      });
    }

    // Wait 3 more days
    await step.sleep("day-4-wait", "3 days");

    // Plan-specific content
    if (plan === "pro") {
      await step.do("send-pro-tips", async () => {
        await sendEmail(email, "Advanced features for Pro users");
      });
    } else {
      await step.do("send-upgrade-offer", async () => {
        await sendEmail(email, "Upgrade to Pro for more features");
      });
    }

    // Final check-in at day 14
    await step.sleep("day-14-wait", "10 days");

    await step.do("send-check-in", async () => {
      await sendEmail(email, "How are things going?");
    });

    return { userId, onboardingComplete: true };
  }
}
```

## Batch Processing with Error Handling

Process items with individual error handling.

```typescript
import type { env, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";

type BatchParams = {
  items: string[];
};

export class BatchWorkflow extends WorkflowEntrypoint<typeof env, BatchParams> {
  async run(event: WorkflowEvent<BatchParams>, step: WorkflowStep) {
    const { items } = event.payload;
    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const itemId of items) {
      try {
        await step.do(`process-item-${itemId}`, async () => {
          await processItem(itemId);
        });
        results.push({ id: itemId, success: true });
      } catch (e) {
        // Log failure but continue with other items
        results.push({ id: itemId, success: false, error: e.message });
        await step.do(`log-failure-${itemId}`, async () => {
          console.log(`Failed to process ${itemId}: ${e.message}`);
        });
      }
    }

    // Summary step
    const summary = await step.do("create-summary", async () => {
      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      return { total: items.length, succeeded, failed };
    });

    // Notify on completion
    await step.do("send-notification", async () => {
      await sendSlackMessage(
        `Batch complete: ${summary.succeeded}/${summary.total} succeeded`,
      );
    });

    return { results, summary };
  }
}
```

## Approval Workflow

Human-in-the-loop approval process.

```typescript
import type { env, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";

type ApprovalParams = {
  requestId: string;
  requestedBy: string;
  amount: number;
};

export class ApprovalWorkflow extends WorkflowEntrypoint<
  typeof env,
  ApprovalParams
> {
  async run(event: WorkflowEvent<ApprovalParams>, step: WorkflowStep) {
    const { requestId, requestedBy, amount } = event.payload;

    // Determine approver based on amount
    const approver = await step.do("determine-approver", async () => {
      if (amount > 10000) return "cfo@company.com";
      if (amount > 1000) return "manager@company.com";
      return "supervisor@company.com";
    });

    // Send approval request
    await step.do("send-approval-request", async () => {
      await sendEmail(
        approver,
        `Please approve request ${requestId} for $${amount}`,
      );
    });

    // Wait for approval (up to 7 days)
    let decision: { approved: boolean; comments?: string };
    try {
      const response = await step.waitForEvent<typeof decision>(
        "await-approval",
        {
          type: "approval-decision",
          timeout: "7 days",
        },
      );
      decision = response.payload;
    } catch (e) {
      // Timeout = auto-reject
      decision = { approved: false, comments: "Request timed out" };
    }

    // Process decision
    if (decision.approved) {
      await step.do("process-approval", async () => {
        await processApprovedRequest(requestId);
      });
      await step.do("notify-requester-approved", async () => {
        await sendEmail(requestedBy, `Your request ${requestId} was approved!`);
      });
    } else {
      await step.do("notify-requester-rejected", async () => {
        await sendEmail(
          requestedBy,
          `Your request ${requestId} was rejected: ${decision.comments}`,
        );
      });
    }

    return { requestId, decision };
  }
}
```

## Scheduled Report Generation

Generate and distribute reports on a schedule.

```typescript
import type { env, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";

type ReportParams = {
  reportType: "daily" | "weekly" | "monthly";
  recipients: string[];
};

export class ReportWorkflow extends WorkflowEntrypoint<
  typeof env,
  ReportParams
> {
  async run(event: WorkflowEvent<ReportParams>, step: WorkflowStep) {
    const { reportType, recipients } = event.payload;

    // Gather data
    const data = await step.do("gather-metrics", async () => {
      return await gatherMetrics(reportType);
    });

    // Generate report
    const report = await step.do(
      "generate-report",
      {
        timeout: "30 minutes",
      },
      async () => {
        return await generateReport(reportType, data);
      },
    );

    // Upload to storage
    const reportUrl = await step.do("upload-report", async () => {
      const key = `reports/${reportType}/${Date.now()}.pdf`;
      await this.env.R2.put(key, report);
      return `https://reports.example.com/${key}`;
    });

    // Send to all recipients
    for (const recipient of recipients) {
      await step.do(`email-${recipient.replace("@", "-at-")}`, async () => {
        await sendEmail(recipient, `Your ${reportType} report`, reportUrl);
      });
    }

    return { reportUrl, sentTo: recipients };
  }
}
```

## GitHub Import Workflow

Real-world example: importing skills from a GitHub repository with status updates.

```typescript
import type { env, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { renderRealtimeClients } from "rwsdk/realtime/worker";

type GitHubImportParams = {
  jobId: string;
  userId: string;
  githubUrl: string;
};

export class GitHubImportWorkflow extends WorkflowEntrypoint<
  typeof env,
  GitHubImportParams
> {
  async run(event: WorkflowEvent<GitHubImportParams>, step: WorkflowStep) {
    const { jobId, userId, githubUrl } = event.payload;

    // Dynamic import for database
    const { db } = await import("@/db");

    // Step 1: Parse GitHub URL
    const parsedUrl = await step.do("parse-github-url", async () => {
      const { parseGitHubUrl } = await import("@/lib/github");
      const parsed = parseGitHubUrl(githubUrl);
      if (!parsed) {
        throw new NonRetryableError("Invalid GitHub URL");
      }
      return parsed;
    });

    // Update job status
    await step.do("update-status-scanning", async () => {
      await db
        .updateTable("importJob")
        .set({
          status: "scanning",
          progress: 10,
          updatedAt: new Date().toISOString(),
        })
        .where("id", "=", jobId)
        .execute();
      await renderRealtimeClients({
        durableObjectNamespace: this.env.REALTIME_DURABLE_OBJECT,
        key: `/import/${jobId}`,
      });
    });

    // Step 2: Get repository info with retries
    const repoInfo = await step.do(
      "fetch-repo-info",
      {
        retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
        timeout: "2 minutes",
      },
      async () => {
        const { getRepoInfo, isGitHubError } = await import("@/lib/github");
        const info = await getRepoInfo(parsedUrl.owner, parsedUrl.repo);
        if (isGitHubError(info)) {
          throw new Error(`GitHub API error: ${info.message}`);
        }
        return info;
      },
    );

    // Step 3: Scan for skills
    const scanResult = await step.do(
      "scan-repository",
      {
        retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
        timeout: "5 minutes",
      },
      async () => {
        const { scanRepository, isScanError } = await import(
          "@/lib/github-scanner"
        );
        const result = await scanRepository(
          parsedUrl.owner,
          parsedUrl.repo,
          repoInfo.defaultBranch,
        );
        if (isScanError(result)) {
          throw new Error(`Repository scan failed: ${result.message}`);
        }
        return result;
      },
    );

    if (scanResult.totalSkillsFound === 0) {
      await step.do("update-status-no-skills", async () => {
        await db
          .updateTable("importJob")
          .set({
            status: "failed",
            error: "No SKILL.md files found",
            completedAt: new Date().toISOString(),
          })
          .where("id", "=", jobId)
          .execute();
      });
      throw new NonRetryableError("No SKILL.md files found in repository");
    }

    // Step 4: Import skills
    const importResult = await step.do(
      "import-skills",
      {
        retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
        timeout: "15 minutes",
      },
      async () => {
        const { importSkills } = await import("@/lib/github-batch-import");
        return await importSkills(db, scanResult.skills, userId, parsedUrl);
      },
    );

    // Step 5: Update final status
    await step.do("update-status-completed", async () => {
      await db
        .updateTable("importJob")
        .set({
          status: "completed",
          progress: 100,
          importedSkillsCount: importResult.importedCount,
          completedAt: new Date().toISOString(),
        })
        .where("id", "=", jobId)
        .execute();
      await renderRealtimeClients({
        durableObjectNamespace: this.env.REALTIME_DURABLE_OBJECT,
        key: `/import/${jobId}`,
      });
    });

    return {
      success: true,
      importedCount: importResult.importedCount,
      failedCount: importResult.failedCount,
    };
  }
}
```
