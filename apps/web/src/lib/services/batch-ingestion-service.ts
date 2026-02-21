import type { FactsAppDatabase } from '@/db/facts';
import { ValidationError } from '@/lib/errors';
import {
  ingestText,
  ingestGoogleDoc,
  ingestLinearResource,
  ingestGitHubContent,
  type IngestionResult,
} from '@/lib/services/ingestion-service';

const MAX_BATCH_SIZE = 10;

// --- Types ---

export interface BulkIngestItem {
  type: 'google_doc' | 'github' | 'linear' | 'text';
  documentUrl?: string;
  contentUrl?: string;
  resourceUrl?: string;
  text?: string;
  title?: string;
}

export interface BulkIngestInput {
  brainId: string;
  userId: string;
  items: BulkIngestItem[];
}

export interface BulkIngestItemResult {
  index: number;
  status: 'success' | 'error' | 'skipped';
  type: string;
  title?: string;
  result?: IngestionResult;
  error?: { code: string; message: string };
}

export interface BulkIngestResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: BulkIngestItemResult[];
}

// --- Implementation ---

export async function bulkIngest(
  factsDb: FactsAppDatabase,
  env: Env,
  input: BulkIngestInput
): Promise<BulkIngestResult> {
  if (input.items.length > MAX_BATCH_SIZE) {
    throw new ValidationError(
      `Batch size exceeds maximum of ${MAX_BATCH_SIZE} items`
    );
  }

  const results: BulkIngestItemResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];

    try {
      let result: IngestionResult | { error: string; message: string };

      switch (item.type) {
        case 'google_doc':
          result = await ingestGoogleDoc(factsDb, env, {
            brainId: input.brainId,
            documentUrl: item.documentUrl!,
            userId: input.userId,
          });
          break;

        case 'github':
          result = await ingestGitHubContent(factsDb, env, {
            brainId: input.brainId,
            contentUrl: item.contentUrl!,
            userId: input.userId,
          });
          break;

        case 'linear':
          result = await ingestLinearResource(factsDb, env, {
            brainId: input.brainId,
            resourceUrl: item.resourceUrl!,
            userId: input.userId,
          });
          break;

        case 'text':
          result = await ingestText(factsDb, env, {
            brainId: input.brainId,
            text: item.text!,
            title: item.title,
            userId: input.userId,
          });
          break;

        default:
          results.push({
            index: i,
            status: 'error',
            type: item.type,
            error: { code: 'invalid_type', message: `Unknown item type: ${item.type}` },
          });
          failed++;
          continue;
      }

      if ('error' in result) {
        if (result.error === 'no_changes') {
          results.push({
            index: i,
            status: 'skipped',
            type: item.type,
            title: item.title,
          });
          skipped++;
        } else {
          results.push({
            index: i,
            status: 'error',
            type: item.type,
            title: item.title,
            error: { code: result.error, message: result.message },
          });
          failed++;
        }
      } else {
        results.push({
          index: i,
          status: 'success',
          type: item.type,
          title: item.title ?? result.ingestion.id,
          result,
        });
        succeeded++;
      }
    } catch (err) {
      results.push({
        index: i,
        status: 'error',
        type: item.type,
        title: item.title,
        error: {
          code: 'internal',
          message: err instanceof Error ? err.message : 'Unknown error',
        },
      });
      failed++;
    }
  }

  return {
    total: input.items.length,
    succeeded,
    failed,
    skipped,
    results,
  };
}
