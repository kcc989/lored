import { nanoid } from 'nanoid';
import { Knn, Search, K } from 'chromadb';

import type { FactsAppDatabase } from '@/db/facts';
import { getOrCreateBrainCollection } from '@/lib/chromadb/client';
import { syncFactToChroma } from '@/lib/chromadb/sync';
import {
  extractFacts,
  type ExtractionInput,
} from '@/lib/services/extraction-agent-service';
import { createFact, updateFact } from '@/lib/services/fact-service';
import {
  computeTrustScore,
  getSourceAuthority,
  AUTO_APPROVE_THRESHOLD,
} from '@/lib/services/trust-score-service';
import {
  getOrCreateTopic,
  linkFactToTopic,
  updateCoverageScore,
} from '@/lib/services/topic-service';
import { createTopicQuestion } from '@/lib/services/topic-question-service';
import {
  getValidGoogleToken,
  GoogleAuthError,
} from '@/lib/services/google-auth-service';
import {
  parseGoogleDocUrl,
  isGoogleDocUrl,
  extractGoogleDocUrl,
  getDocumentMetadata,
  fetchDocumentContent,
  GoogleDocError,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/services/google-docs-service';

// --- Types ---

export interface IngestTextInput {
  brainId: string;
  text: string;
  title?: string;
  userId: string;
}

export interface IngestFileInput {
  brainId: string;
  file: ArrayBuffer;
  filename: string;
  mimeType: string;
  userId: string;
}

export interface IngestGoogleDocInput {
  brainId: string;
  documentUrl: string;
  userId: string;
}

export interface GoogleDocErrorResult {
  error: string;
  message: string;
  connectUrl?: string;
  documentTitle?: string;
  sizeBytes?: number;
  maxSizeBytes?: number;
}

export interface IngestionResult {
  ingestion: { id: string; status: string; factCount: number };
  factsCreated: Array<{
    id: string;
    content: string;
    type: string;
    trustScore: number;
  }>;
  factsUpdated: Array<{ id: string; content: string; changeReason: string }>;
  conflictsDetected: Array<{
    existingFactId: string;
    newContent: string;
    conflictDescription: string;
  }>;
  topicsCreated: string[];
  questionsGenerated: number;
}

// --- Deduplication ---

const DEDUP_THRESHOLD = 0.92;

async function checkDuplicate(
  env: Env,
  brainId: string,
  factContent: string
): Promise<{ isDuplicate: boolean; existingFactId?: string; similarity?: number }> {
  const collection = await getOrCreateBrainCollection(env, brainId);

  const search = new Search()
    .rank(Knn({ query: factContent, returnRank: true, limit: 1 }))
    .limit(1)
    .select(K.SCORE, 'factId');

  const results = await collection.search(search);
  const rows = results.rows()[0] ?? [];

  if (rows.length === 0) {
    return { isDuplicate: false };
  }

  const topResult = rows[0];
  const similarity = topResult.score ?? 0;

  if (similarity >= DEDUP_THRESHOLD) {
    return {
      isDuplicate: true,
      existingFactId: (topResult.metadata?.factId as string) ?? topResult.id,
      similarity,
    };
  }

  return { isDuplicate: false };
}

// --- Context Retrieval ---

async function getExistingContext(
  env: Env,
  factsDb: FactsAppDatabase,
  brainId: string,
  queryText: string
) {
  // Get similar existing facts for context
  const collection = await getOrCreateBrainCollection(env, brainId);

  let existingFacts: Array<{
    id: string;
    content: string;
    type: string;
    trustScore: number;
  }> = [];

  try {
    const search = new Search()
      .rank(Knn({ query: queryText, returnRank: true, limit: 30 }))
      .limit(30)
      .select(K.DOCUMENT, K.SCORE, 'factId', 'type', 'trustScore');

    const results = await collection.search(search);
    const rows = results.rows()[0] ?? [];

    existingFacts = rows.map((row) => ({
      id: (row.metadata?.factId as string) ?? row.id,
      content: row.document ?? '',
      type: (row.metadata?.type as string) ?? 'general',
      trustScore: (row.metadata?.trustScore as number) ?? 0.5,
    }));
  } catch {
    // Empty collection — no existing facts yet
  }

  // Get existing topics
  const existingTopics = await factsDb
    .selectFrom('topic')
    .where('brainId', '=', brainId)
    .where('status', '=', 'active')
    .select(['name', 'description'])
    .execute();

  return { existingFacts, existingTopics };
}

// --- Core Pipeline ---

async function processExtraction(
  factsDb: FactsAppDatabase,
  env: Env,
  brainId: string,
  ingestionId: string,
  sourceType: 'text_input' | 'document_upload' | 'image_upload' | 'google_doc',
  extractionInput: ExtractionInput,
  userId: string
): Promise<Omit<IngestionResult, 'ingestion'>> {
  const now = new Date().toISOString();
  const authority = getSourceAuthority(sourceType);

  // Call the extraction agent
  const extraction = await extractFacts(env, extractionInput);

  const factsCreated: IngestionResult['factsCreated'] = [];
  const factsUpdated: IngestionResult['factsUpdated'] = [];
  const conflictsDetected: IngestionResult['conflictsDetected'] = [];
  const topicsCreated: string[] = [];

  // 1. Process new fact candidates
  for (const candidate of extraction.facts) {
    // Check for duplicates
    const dedup = await checkDuplicate(env, brainId, candidate.content);

    if (dedup.isDuplicate && dedup.existingFactId) {
      // Corroborate existing fact
      await factsDb
        .updateTable('fact')
        .set({
          corroborationCount: factsDb.fn('coalesce', [
            factsDb.raw('corroborationCount + 1'),
            factsDb.raw('1'),
          ]),
          sourceCount: factsDb.fn('coalesce', [
            factsDb.raw('sourceCount + 1'),
            factsDb.raw('2'),
          ]),
          updatedAt: now,
        })
        .where('id', '=', dedup.existingFactId)
        .execute();

      // Record the link
      await factsDb
        .insertInto('ingestion_fact')
        .values({
          id: nanoid(),
          ingestionId,
          factId: dedup.existingFactId,
          action: 'corroborated',
          extractionConfidence: candidate.confidence,
          createdAt: now,
        })
        .execute();

      // Re-sync trust score to ChromaDB
      const existingFact = await factsDb
        .selectFrom('fact')
        .where('id', '=', dedup.existingFactId)
        .selectAll()
        .executeTakeFirst();

      if (existingFact) {
        const tags = await factsDb
          .selectFrom('fact_tag')
          .where('factId', '=', existingFact.id)
          .select('tagValue')
          .execute();

        const newTrust = computeTrustScore({
          extractionConfidence: existingFact.extractionConfidence ?? 1.0,
          sourceAuthority: existingFact.sourceAuthority ?? 0.9,
          sourceCount: existingFact.sourceCount ?? 1,
          corroborationCount: existingFact.corroborationCount ?? 0,
          citationCount: existingFact.citationCount,
          openQuestionCount: 0,
          totalQuestionCount: existingFact.questionCount,
          hasConflict: existingFact.status === 'conflict',
        });

        await factsDb
          .updateTable('fact')
          .set({ trustScore: newTrust })
          .where('id', '=', existingFact.id)
          .execute();

        await syncFactToChroma(
          env,
          brainId,
          { ...existingFact, trustScore: newTrust, updatedAt: now },
          tags.map((t) => t.tagValue)
        );
      }

      continue;
    }

    // New fact — compute trust score and create
    const trustScore = computeTrustScore({
      extractionConfidence: candidate.confidence,
      sourceAuthority: authority,
      sourceCount: 1,
      corroborationCount: 0,
      citationCount: 0,
      openQuestionCount: 0,
      totalQuestionCount: 0,
      hasConflict: false,
    });

    const status = trustScore >= AUTO_APPROVE_THRESHOLD ? 'active' : 'pending_review';

    const fact = await createFact(factsDb, env, {
      brainId,
      content: candidate.content,
      type: candidate.type,
      status,
      trustScore,
      sourceAuthority: authority,
      extractionConfidence: candidate.confidence,
      userId,
    });

    if (fact) {
      factsCreated.push({
        id: fact.id,
        content: fact.content,
        type: fact.type,
        trustScore: fact.trustScore,
      });

      // Record ingestion link
      await factsDb
        .insertInto('ingestion_fact')
        .values({
          id: nanoid(),
          ingestionId,
          factId: fact.id,
          action: 'created',
          extractionConfidence: candidate.confidence,
          createdAt: now,
        })
        .execute();

      // Link to topics
      for (const topicName of candidate.topics) {
        const topic = await getOrCreateTopic(factsDb, brainId, topicName);
        await linkFactToTopic(factsDb, topic.id, fact.id);
      }
    }
  }

  // 2. Process updates to existing facts
  for (const update of extraction.updates) {
    if (update.confidence >= 0.8) {
      const updated = await updateFact(factsDb, env, {
        factId: update.existingFactId,
        content: update.suggestedContent,
        changeReason: update.reasoning,
        userId,
      });

      if (updated) {
        factsUpdated.push({
          id: updated.id,
          content: updated.content,
          changeReason: update.reasoning,
        });

        await factsDb
          .insertInto('ingestion_fact')
          .values({
            id: nanoid(),
            ingestionId,
            factId: updated.id,
            action: 'updated',
            extractionConfidence: update.confidence,
            createdAt: now,
          })
          .execute();
      }
    }
  }

  // 3. Process conflicts
  for (const conflict of extraction.conflicts) {
    conflictsDetected.push({
      existingFactId: conflict.existingFactId,
      newContent: conflict.newContent,
      conflictDescription: conflict.conflictDescription,
    });

    // Create the conflicting fact with status 'conflict'
    const conflictFact = await createFact(factsDb, env, {
      brainId,
      content: conflict.newContent,
      type: 'general',
      status: 'conflict',
      trustScore: 0.2,
      sourceAuthority: authority,
      extractionConfidence: 0.5,
      userId,
    });

    if (conflictFact) {
      await factsDb
        .insertInto('ingestion_fact')
        .values({
          id: nanoid(),
          ingestionId,
          factId: conflictFact.id,
          action: 'conflict_detected',
          extractionConfidence: 0.5,
          createdAt: now,
        })
        .execute();
    }
  }

  // 4. Process topics
  for (const topicData of extraction.topics) {
    const topic = await getOrCreateTopic(
      factsDb,
      brainId,
      topicData.name,
      topicData.description
    );
    if (topicData.isNew) {
      topicsCreated.push(topicData.name);
    }
    await updateCoverageScore(factsDb, topic.id);
  }

  // 5. Process questions
  let questionsGenerated = 0;
  for (const q of extraction.questions) {
    const topic = await getOrCreateTopic(factsDb, brainId, q.topic);
    await createTopicQuestion(factsDb, {
      topicId: topic.id,
      brainId,
      question: q.question,
      priority: q.priority,
    });
    questionsGenerated++;
  }

  return {
    factsCreated,
    factsUpdated,
    conflictsDetected,
    topicsCreated,
    questionsGenerated,
  };
}

// --- Public API ---

export async function ingestText(
  factsDb: FactsAppDatabase,
  env: Env,
  input: IngestTextInput
): Promise<IngestionResult> {
  const now = new Date().toISOString();
  const ingestionId = nanoid();

  // Create ingestion record
  await factsDb
    .insertInto('ingestion')
    .values({
      id: ingestionId,
      brainId: input.brainId,
      sourceType: 'text_input',
      title: input.title ?? 'Pasted text',
      rawText: input.text,
      r2Key: null,
      mimeType: null,
      fileSizeBytes: null,
      status: 'processing',
      factCount: 0,
      errorMessage: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.userId,
    })
    .execute();

  try {
    // Get existing context
    const { existingFacts, existingTopics } = await getExistingContext(
      env,
      factsDb,
      input.brainId,
      input.text.slice(0, 500) // Use first 500 chars as query
    );

    // Run extraction pipeline
    const result = await processExtraction(
      factsDb,
      env,
      input.brainId,
      ingestionId,
      'text_input',
      {
        rawText: input.text,
        sourceDescription: input.title ?? 'Pasted text',
        sourceType: 'text_input',
        existingFacts,
        existingTopics,
      },
      input.userId
    );

    // Update ingestion record
    const factCount =
      result.factsCreated.length + result.factsUpdated.length;
    await factsDb
      .updateTable('ingestion')
      .set({
        status: 'completed',
        factCount,
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', ingestionId)
      .execute();

    return {
      ingestion: { id: ingestionId, status: 'completed', factCount },
      ...result,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    await factsDb
      .updateTable('ingestion')
      .set({
        status: 'failed',
        errorMessage,
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', ingestionId)
      .execute();
    throw error;
  }
}

export async function ingestFile(
  factsDb: FactsAppDatabase,
  env: Env,
  input: IngestFileInput
): Promise<IngestionResult> {
  const now = new Date().toISOString();
  const ingestionId = nanoid();
  const r2Key = `${input.brainId}/${ingestionId}/${input.filename}`;

  // Upload to R2
  await env.INGESTION_BUCKET.put(r2Key, input.file, {
    httpMetadata: { contentType: input.mimeType },
  });

  // Determine source type
  const isImage = input.mimeType.startsWith('image/');
  const isPdf = input.mimeType === 'application/pdf';
  const sourceType = isImage ? 'image_upload' : 'document_upload';

  // Create ingestion record
  await factsDb
    .insertInto('ingestion')
    .values({
      id: ingestionId,
      brainId: input.brainId,
      sourceType,
      title: input.filename,
      rawText: null,
      r2Key,
      mimeType: input.mimeType,
      fileSizeBytes: input.file.byteLength,
      status: 'processing',
      factCount: 0,
      errorMessage: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.userId,
    })
    .execute();

  try {
    const { existingFacts, existingTopics } = await getExistingContext(
      env,
      factsDb,
      input.brainId,
      input.filename
    );

    const extractionInput: ExtractionInput = {
      rawText: '',
      sourceDescription: input.filename,
      sourceType,
      existingFacts,
      existingTopics,
    };

    if (isImage) {
      // Send image to Claude Vision
      const base64 = arrayBufferToBase64(input.file);
      extractionInput.imageBase64 = base64;
      extractionInput.imageMimeType = input.mimeType;
      extractionInput.rawText = `Image file: ${input.filename}`;
    } else if (isPdf) {
      // Send PDF to Claude's native PDF support
      const base64 = arrayBufferToBase64(input.file);
      extractionInput.pdfBase64 = base64;
      extractionInput.rawText = `PDF document: ${input.filename}`;
    } else {
      // Text file — read as UTF-8
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(input.file);
      extractionInput.rawText = text;

      // Store extracted text
      await factsDb
        .updateTable('ingestion')
        .set({ rawText: text })
        .where('id', '=', ingestionId)
        .execute();
    }

    const result = await processExtraction(
      factsDb,
      env,
      input.brainId,
      ingestionId,
      sourceType as 'document_upload' | 'image_upload',
      extractionInput,
      input.userId
    );

    const factCount =
      result.factsCreated.length + result.factsUpdated.length;
    await factsDb
      .updateTable('ingestion')
      .set({
        status: 'completed',
        factCount,
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', ingestionId)
      .execute();

    return {
      ingestion: { id: ingestionId, status: 'completed', factCount },
      ...result,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    await factsDb
      .updateTable('ingestion')
      .set({
        status: 'failed',
        errorMessage,
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', ingestionId)
      .execute();
    throw error;
  }
}

export async function getIngestion(
  factsDb: FactsAppDatabase,
  ingestionId: string
) {
  const ingestion = await factsDb
    .selectFrom('ingestion')
    .where('id', '=', ingestionId)
    .selectAll()
    .executeTakeFirst();

  if (!ingestion) return null;

  const linkedFacts = await factsDb
    .selectFrom('ingestion_fact')
    .innerJoin('fact', 'fact.id', 'ingestion_fact.factId')
    .where('ingestion_fact.ingestionId', '=', ingestionId)
    .select([
      'fact.id',
      'fact.content',
      'fact.type',
      'fact.status',
      'fact.trustScore',
      'ingestion_fact.action',
      'ingestion_fact.extractionConfidence',
    ])
    .execute();

  return { ...ingestion, facts: linkedFacts };
}

export async function listIngestions(
  factsDb: FactsAppDatabase,
  brainId: string,
  options: { status?: string; page?: number; limit?: number } = {}
) {
  const { status, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  let query = factsDb
    .selectFrom('ingestion')
    .where('brainId', '=', brainId);

  if (status) query = query.where('status', '=', status);

  return query
    .selectAll()
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .offset(offset)
    .execute();
}

// --- Google Docs Ingestion ---

/**
 * Ingest a Google Doc by URL. Fetches the document content using the user's
 * Google connection, then runs it through the standard extraction pipeline.
 *
 * Returns a GoogleDocErrorResult if there's a connection or access issue,
 * or an IngestionResult on success.
 */
export async function ingestGoogleDoc(
  factsDb: FactsAppDatabase,
  env: Env,
  input: IngestGoogleDocInput
): Promise<IngestionResult | GoogleDocErrorResult> {
  // 1. Parse the URL
  const parsed = parseGoogleDocUrl(input.documentUrl);
  if (!parsed) {
    return {
      error: 'invalid_url',
      message: 'Not a valid Google Docs URL. Expected format: https://docs.google.com/document/d/.../edit',
    };
  }

  // 2. Get a valid Google token
  let accessToken: string;
  try {
    const result = await getValidGoogleToken(env, input.userId);
    accessToken = result.accessToken;
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      if (err.code === 'google_not_connected') {
        return {
          error: 'google_not_connected',
          message: 'Connect your Google account to ingest Google Docs.',
          connectUrl: '/api/integrations/google/connect',
        };
      }
      return {
        error: err.code,
        message: err.message,
        connectUrl: '/api/integrations/google/connect',
      };
    }
    throw err;
  }

  // 3. Fetch document metadata
  let metadata;
  try {
    metadata = await getDocumentMetadata(accessToken, parsed.documentId);
  } catch (err) {
    if (err instanceof GoogleDocError) {
      return {
        error: err.code,
        message: err.message,
        ...err.details,
      };
    }
    throw err;
  }

  // 4. Check raw file size limit
  if (metadata.size && metadata.size > MAX_FILE_SIZE_BYTES) {
    return {
      error: 'google_doc_too_large',
      message: `Document "${metadata.title}" is too large (${formatBytes(metadata.size)}). Maximum file size is ${formatBytes(MAX_FILE_SIZE_BYTES)}.`,
      documentTitle: metadata.title,
      sizeBytes: metadata.size,
      maxSizeBytes: MAX_FILE_SIZE_BYTES,
    };
  }

  // 5. Fetch content and check text size limit
  let content;
  try {
    content = await fetchDocumentContent(accessToken, parsed.documentId);
  } catch (err) {
    if (err instanceof GoogleDocError) {
      return {
        error: err.code,
        message: err.message,
        documentTitle: metadata.title,
        ...err.details,
      };
    }
    throw err;
  }

  // 6. Check if already ingested with same content
  const existing = await factsDb
    .selectFrom('ingested_document')
    .where('brainId', '=', input.brainId)
    .where('provider', '=', 'google_docs')
    .where('externalDocumentId', '=', parsed.documentId)
    .selectAll()
    .executeTakeFirst();

  if (existing && existing.contentHash === content.contentHash) {
    return {
      error: 'no_changes',
      message: `Document "${metadata.title}" has not changed since last ingestion.`,
      documentTitle: metadata.title,
    };
  }

  // 7. Create ingestion record and run extraction
  const now = new Date().toISOString();
  const ingestionId = nanoid();

  const ingestionMetadata = JSON.stringify({
    googleDocId: parsed.documentId,
    googleDocUrl: input.documentUrl,
    documentTitle: metadata.title,
    lastModifiedTime: metadata.lastModifiedTime,
    exportFormat: 'text/html',
  });

  await factsDb
    .insertInto('ingestion')
    .values({
      id: ingestionId,
      brainId: input.brainId,
      sourceType: 'google_doc',
      title: metadata.title,
      rawText: content.text,
      r2Key: null,
      mimeType: 'application/vnd.google-apps.document',
      fileSizeBytes: new TextEncoder().encode(content.text).length,
      status: 'processing',
      factCount: 0,
      errorMessage: null,
      metadata: ingestionMetadata,
      createdAt: now,
      updatedAt: now,
      createdBy: input.userId,
    })
    .execute();

  try {
    const { existingFacts, existingTopics } = await getExistingContext(
      env,
      factsDb,
      input.brainId,
      content.text.slice(0, 500)
    );

    const result = await processExtraction(
      factsDb,
      env,
      input.brainId,
      ingestionId,
      'google_doc',
      {
        rawText: content.text,
        sourceDescription: `Google Doc: ${metadata.title}`,
        sourceType: 'google_doc',
        existingFacts,
        existingTopics,
      },
      input.userId
    );

    const factCount =
      result.factsCreated.length + result.factsUpdated.length;

    await factsDb
      .updateTable('ingestion')
      .set({
        status: 'completed',
        factCount,
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', ingestionId)
      .execute();

    // 8. Upsert ingested_document record
    if (existing) {
      await factsDb
        .updateTable('ingested_document')
        .set({
          title: metadata.title,
          documentUrl: input.documentUrl,
          lastIngestionId: ingestionId,
          lastModifiedAt: metadata.lastModifiedTime,
          lastIngestedAt: now,
          contentHash: content.contentHash,
          ingestionCount: factsDb.raw('ingestionCount + 1'),
          updatedAt: now,
        })
        .where('id', '=', existing.id)
        .execute();
    } else {
      await factsDb
        .insertInto('ingested_document')
        .values({
          id: nanoid(),
          brainId: input.brainId,
          provider: 'google_docs',
          externalDocumentId: parsed.documentId,
          title: metadata.title,
          documentUrl: input.documentUrl,
          lastIngestionId: ingestionId,
          lastModifiedAt: metadata.lastModifiedTime,
          lastIngestedAt: now,
          contentHash: content.contentHash,
          ingestionCount: 1,
          status: 'active',
          metadata: JSON.stringify({ owners: metadata.owners }),
          createdAt: now,
          updatedAt: now,
          createdBy: input.userId,
        })
        .execute();
    }

    return {
      ingestion: { id: ingestionId, status: 'completed', factCount },
      ...result,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    await factsDb
      .updateTable('ingestion')
      .set({
        status: 'failed',
        errorMessage,
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', ingestionId)
      .execute();
    throw error;
  }
}

/**
 * Check if text input is a Google Doc URL and should be routed to Google Doc ingestion.
 */
export function detectGoogleDocInText(text: string): string | null {
  const trimmed = text.trim();
  // Only auto-detect if the entire input looks like a URL or starts with one
  if (isGoogleDocUrl(trimmed)) {
    return extractGoogleDocUrl(trimmed);
  }
  return null;
}

/**
 * List ingested documents for a brain.
 */
export async function listIngestedDocuments(
  factsDb: FactsAppDatabase,
  brainId: string,
  options: { page?: number; limit?: number } = {}
) {
  const { page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  return factsDb
    .selectFrom('ingested_document')
    .where('brainId', '=', brainId)
    .where('status', '=', 'active')
    .selectAll()
    .orderBy('lastIngestedAt', 'desc')
    .limit(limit)
    .offset(offset)
    .execute();
}

// --- Helpers ---

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
