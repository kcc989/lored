import { convertHtmlToText } from './html-to-text';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';

/** Maximum exported text content size: 500KB (~125K words) */
export const MAX_TEXT_SIZE_BYTES = 500 * 1024;

/** Maximum raw file size from Drive metadata: 10MB */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const GOOGLE_DOC_URL_PATTERN = /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/;

export interface GoogleDocMetadata {
  id: string;
  title: string;
  lastModifiedTime: string;
  mimeType: string;
  size: number | null;
  owners: Array<{ displayName: string; emailAddress: string }>;
}

export interface GoogleDocContent {
  text: string;
  contentHash: string;
}

/**
 * Extract the document ID from a Google Docs URL.
 * Returns null if the URL is not a valid Google Docs URL.
 */
export function parseGoogleDocUrl(url: string): { documentId: string } | null {
  const match = url.match(GOOGLE_DOC_URL_PATTERN);
  if (!match) return null;
  return { documentId: match[1] };
}

/**
 * Check if a string contains a Google Doc URL.
 * Used for auto-detection when users paste URLs into text ingestion.
 */
export function isGoogleDocUrl(text: string): boolean {
  const trimmed = text.trim();
  return GOOGLE_DOC_URL_PATTERN.test(trimmed);
}

/**
 * Extract a Google Doc URL from text that may contain one.
 * Returns the first Google Doc URL found, or null.
 */
export function extractGoogleDocUrl(text: string): string | null {
  const urlPattern = /https?:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9_-]+[^\s)}\]'"<]*/;
  const match = text.match(urlPattern);
  return match ? match[0] : null;
}

/**
 * Fetch document metadata from the Google Drive API.
 */
export async function getDocumentMetadata(
  accessToken: string,
  documentId: string
): Promise<GoogleDocMetadata> {
  const fields = 'id,name,modifiedTime,mimeType,size,owners(displayName,emailAddress)';
  const response = await fetch(`${DRIVE_API_BASE}/${documentId}?fields=${fields}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 404) {
    throw new GoogleDocError(
      'google_doc_not_found',
      'Document not found. Check that the URL is correct and the document has not been deleted.'
    );
  }

  if (response.status === 403) {
    throw new GoogleDocError(
      'google_access_denied',
      'Your Google account does not have access to this document. Make sure the document is shared with you.'
    );
  }

  if (!response.ok) {
    throw new GoogleDocError(
      'google_api_error',
      `Google Drive API error: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as {
    id: string;
    name: string;
    modifiedTime: string;
    mimeType: string;
    size?: string;
    owners?: Array<{ displayName: string; emailAddress: string }>;
  };

  return {
    id: data.id,
    title: data.name,
    lastModifiedTime: data.modifiedTime,
    mimeType: data.mimeType,
    size: data.size ? parseInt(data.size, 10) : null,
    owners: data.owners ?? [],
  };
}

/**
 * Fetch document content by exporting as HTML, then converting to clean text.
 * Returns the text content and a SHA-256 content hash for change detection.
 */
export async function fetchDocumentContent(
  accessToken: string,
  documentId: string
): Promise<GoogleDocContent> {
  const response = await fetch(
    `${DRIVE_API_BASE}/${documentId}/export?mimeType=text/html`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (response.status === 404) {
    throw new GoogleDocError(
      'google_doc_not_found',
      'Document not found during content export.'
    );
  }

  if (response.status === 403) {
    throw new GoogleDocError(
      'google_access_denied',
      'Your Google account does not have access to export this document.'
    );
  }

  if (!response.ok) {
    throw new GoogleDocError(
      'google_api_error',
      `Failed to export document: ${response.status} ${response.statusText}`
    );
  }

  const html = await response.text();
  const text = convertHtmlToText(html);

  // Check size limit
  const textBytes = new TextEncoder().encode(text).length;
  if (textBytes > MAX_TEXT_SIZE_BYTES) {
    throw new GoogleDocError(
      'google_doc_too_large',
      `Document is too large to ingest (${formatBytes(textBytes)} of text content). Maximum supported size is ${formatBytes(MAX_TEXT_SIZE_BYTES)}.`,
      { sizeBytes: textBytes, maxSizeBytes: MAX_TEXT_SIZE_BYTES }
    );
  }

  // Compute SHA-256 hash for change detection
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const contentHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return { text, contentHash };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class GoogleDocError extends Error {
  code: string;
  details?: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'GoogleDocError';
  }
}
