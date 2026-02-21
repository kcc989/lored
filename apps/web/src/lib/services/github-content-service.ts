const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

/** Maximum assembled text content size: 500KB */
export const MAX_TEXT_SIZE_BYTES = 500 * 1024;

// --- URL Patterns ---

const GITHUB_ISSUE_PATTERN = /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/;
const GITHUB_PR_PATTERN = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;
const GITHUB_PROJECT_ORG_PATTERN = /github\.com\/orgs\/([^/]+)\/projects\/(\d+)/;
const GITHUB_PROJECT_USER_PATTERN = /github\.com\/users\/([^/]+)\/projects\/(\d+)/;

const GITHUB_URL_PATTERN =
  /https?:\/\/github\.com\/(?:(?:[^/]+\/[^/]+\/(?:issues|pull)\/\d+)|(?:(?:orgs|users)\/[^/]+\/projects\/\d+))/;

// --- Types ---

export type GitHubContentType = 'issue' | 'pull_request' | 'project';

export interface ParsedGitHubUrl {
  type: GitHubContentType;
  owner: string;
  repo?: string;
  number: number;
  rawUrl: string;
}

export interface GitHubContentMetadata {
  type: GitHubContentType;
  title: string;
  owner: string;
  repo?: string;
  number: number;
  state: string;
  updatedAt: string;
  author: string;
  labels: string[];
  url: string;
}

export interface GitHubContent {
  text: string;
  contentHash: string;
}

// --- URL Parsing ---

/**
 * Extract the content type and identifiers from a GitHub URL.
 * Returns null if the URL is not a recognized GitHub content URL.
 */
export function parseGitHubUrl(url: string): ParsedGitHubUrl | null {
  let match = url.match(GITHUB_ISSUE_PATTERN);
  if (match) {
    return {
      type: 'issue',
      owner: match[1],
      repo: match[2],
      number: parseInt(match[3], 10),
      rawUrl: url,
    };
  }

  match = url.match(GITHUB_PR_PATTERN);
  if (match) {
    return {
      type: 'pull_request',
      owner: match[1],
      repo: match[2],
      number: parseInt(match[3], 10),
      rawUrl: url,
    };
  }

  match = url.match(GITHUB_PROJECT_ORG_PATTERN);
  if (match) {
    return {
      type: 'project',
      owner: match[1],
      number: parseInt(match[2], 10),
      rawUrl: url,
    };
  }

  match = url.match(GITHUB_PROJECT_USER_PATTERN);
  if (match) {
    return {
      type: 'project',
      owner: match[1],
      number: parseInt(match[2], 10),
      rawUrl: url,
    };
  }

  return null;
}

/**
 * Check if a string contains a GitHub content URL.
 */
export function isGitHubUrl(text: string): boolean {
  return GITHUB_URL_PATTERN.test(text.trim());
}

/**
 * Extract the first GitHub content URL from text.
 * Returns null if no URL found.
 */
export function extractGitHubUrl(text: string): string | null {
  const match = text.match(GITHUB_URL_PATTERN);
  return match ? match[0] : null;
}

// --- GitHub API Helpers ---

function githubHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Lored/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function githubFetch(
  accessToken: string,
  path: string
): Promise<unknown> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: githubHeaders(accessToken),
  });

  if (response.status === 404) {
    throw new GitHubContentError('github_not_found', 'Resource not found on GitHub.');
  }

  if (response.status === 403) {
    // Check for rate limiting
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining === '0') {
      const resetAt = response.headers.get('x-ratelimit-reset');
      const resetDate = resetAt ? new Date(parseInt(resetAt, 10) * 1000) : null;
      throw new GitHubContentError(
        'github_rate_limited',
        `GitHub API rate limit exceeded.${resetDate ? ` Resets at ${resetDate.toISOString()}.` : ''}`,
        { resetAt: resetDate?.toISOString() }
      );
    }
    throw new GitHubContentError(
      'github_access_denied',
      'Your GitHub account does not have access to this resource.'
    );
  }

  if (!response.ok) {
    throw new GitHubContentError(
      'github_api_error',
      `GitHub API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

async function githubGraphQL(
  accessToken: string,
  query: string,
  variables: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      ...githubHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 401) {
    throw new GitHubContentError(
      'github_access_denied',
      'Your GitHub token does not have access to this resource.'
    );
  }

  if (!response.ok) {
    throw new GitHubContentError(
      'github_api_error',
      `GitHub GraphQL API error: ${response.status} ${response.statusText}`
    );
  }

  const result = (await response.json()) as {
    data?: unknown;
    errors?: Array<{ message: string; type?: string }>;
  };

  if (result.errors?.length) {
    const notFound = result.errors.some(
      (e) => e.type === 'NOT_FOUND' || e.message.includes('not found')
    );
    if (notFound) {
      throw new GitHubContentError('github_not_found', 'Project not found on GitHub.');
    }
    throw new GitHubContentError(
      'github_api_error',
      `GitHub GraphQL error: ${result.errors[0].message}`
    );
  }

  return result.data;
}

// --- Content Fetching ---

interface GitHubIssue {
  title: string;
  body: string | null;
  state: string;
  number: number;
  user: { login: string } | null;
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
  created_at: string;
  updated_at: string;
  html_url: string;
}

interface GitHubComment {
  user: { login: string } | null;
  body: string;
  created_at: string;
}

interface GitHubPullRequest extends GitHubIssue {
  merged: boolean;
  mergeable_state: string;
  additions: number;
  deletions: number;
  changed_files: number;
  head: { ref: string; sha: string };
  base: { ref: string };
}

interface GitHubReview {
  user: { login: string } | null;
  state: string;
  body: string | null;
  submitted_at: string;
}

interface GitHubReviewComment {
  user: { login: string } | null;
  body: string;
  path: string;
  line: number | null;
  created_at: string;
}

/**
 * Fetch and assemble content for a GitHub issue.
 */
async function fetchIssueContent(
  accessToken: string,
  owner: string,
  repo: string,
  number: number
): Promise<{ metadata: GitHubContentMetadata; content: GitHubContent }> {
  const issue = (await githubFetch(
    accessToken,
    `/repos/${owner}/${repo}/issues/${number}`
  )) as GitHubIssue;

  const comments = (await githubFetch(
    accessToken,
    `/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`
  )) as GitHubComment[];

  const metadata: GitHubContentMetadata = {
    type: 'issue',
    title: issue.title,
    owner,
    repo,
    number,
    state: issue.state,
    updatedAt: issue.updated_at,
    author: issue.user?.login ?? 'unknown',
    labels: issue.labels.map((l) => l.name),
    url: issue.html_url,
  };

  // Assemble text
  const parts: string[] = [];
  parts.push(`Issue #${number}: ${issue.title}`);
  parts.push(`Repository: ${owner}/${repo}`);

  const meta: string[] = [`State: ${issue.state}`];
  if (issue.labels.length > 0) {
    meta.push(`Labels: ${issue.labels.map((l) => l.name).join(', ')}`);
  }
  if (issue.assignees.length > 0) {
    meta.push(`Assignees: ${issue.assignees.map((a) => a.login).join(', ')}`);
  }
  meta.push(`Author: @${issue.user?.login ?? 'unknown'}`);
  parts.push(meta.join(' | '));
  parts.push('');

  if (issue.body) {
    parts.push('## Description');
    parts.push(issue.body);
    parts.push('');
  }

  if (comments.length > 0) {
    parts.push(`## Comments (${comments.length})`);
    for (const comment of comments) {
      parts.push(`### @${comment.user?.login ?? 'unknown'} (${comment.created_at.split('T')[0]})`);
      parts.push(comment.body);
      parts.push('');
    }
  }

  const text = parts.join('\n');
  const contentHash = await computeHash(text);

  return { metadata, content: { text, contentHash } };
}

/**
 * Fetch and assemble content for a GitHub pull request.
 */
async function fetchPullRequestContent(
  accessToken: string,
  owner: string,
  repo: string,
  number: number
): Promise<{ metadata: GitHubContentMetadata; content: GitHubContent }> {
  const [pr, comments, reviews, reviewComments] = await Promise.all([
    githubFetch(accessToken, `/repos/${owner}/${repo}/pulls/${number}`) as Promise<GitHubPullRequest>,
    githubFetch(accessToken, `/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`) as Promise<GitHubComment[]>,
    githubFetch(accessToken, `/repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100`) as Promise<GitHubReview[]>,
    githubFetch(accessToken, `/repos/${owner}/${repo}/pulls/${number}/comments?per_page=100`) as Promise<GitHubReviewComment[]>,
  ]);

  const state = pr.merged ? 'merged' : pr.state;

  const metadata: GitHubContentMetadata = {
    type: 'pull_request',
    title: pr.title,
    owner,
    repo,
    number,
    state,
    updatedAt: pr.updated_at,
    author: pr.user?.login ?? 'unknown',
    labels: pr.labels.map((l) => l.name),
    url: pr.html_url,
  };

  const parts: string[] = [];
  parts.push(`Pull Request #${number}: ${pr.title}`);
  parts.push(`Repository: ${owner}/${repo}`);

  const meta: string[] = [
    `State: ${state}`,
    `Branch: ${pr.head.ref} → ${pr.base.ref}`,
  ];
  if (pr.labels.length > 0) {
    meta.push(`Labels: ${pr.labels.map((l) => l.name).join(', ')}`);
  }
  meta.push(`Author: @${pr.user?.login ?? 'unknown'}`);
  parts.push(meta.join(' | '));

  parts.push(`Changes: +${pr.additions} -${pr.deletions} across ${pr.changed_files} files`);
  parts.push('');

  if (pr.body) {
    parts.push('## Description');
    parts.push(pr.body);
    parts.push('');
  }

  // Reviews with state
  const substantiveReviews = reviews.filter((r) => r.state !== 'PENDING');
  if (substantiveReviews.length > 0) {
    parts.push(`## Reviews (${substantiveReviews.length})`);
    for (const review of substantiveReviews) {
      const stateLabel = review.state.toLowerCase().replace('_', ' ');
      parts.push(`### @${review.user?.login ?? 'unknown'} — ${stateLabel} (${review.submitted_at.split('T')[0]})`);
      if (review.body) {
        parts.push(review.body);
      }
      parts.push('');
    }
  }

  // Inline review comments
  if (reviewComments.length > 0) {
    parts.push(`## Review Comments (${reviewComments.length})`);
    for (const rc of reviewComments) {
      const location = rc.line ? `${rc.path}:${rc.line}` : rc.path;
      parts.push(`### @${rc.user?.login ?? 'unknown'} on ${location} (${rc.created_at.split('T')[0]})`);
      parts.push(rc.body);
      parts.push('');
    }
  }

  // General comments
  if (comments.length > 0) {
    parts.push(`## Comments (${comments.length})`);
    for (const comment of comments) {
      parts.push(`### @${comment.user?.login ?? 'unknown'} (${comment.created_at.split('T')[0]})`);
      parts.push(comment.body);
      parts.push('');
    }
  }

  const text = parts.join('\n');
  const contentHash = await computeHash(text);

  return { metadata, content: { text, contentHash } };
}

/**
 * Fetch and assemble content for a GitHub Project (V2).
 */
async function fetchProjectContent(
  accessToken: string,
  owner: string,
  number: number,
  rawUrl: string
): Promise<{ metadata: GitHubContentMetadata; content: GitHubContent }> {
  // Determine if org or user project from URL
  const isOrg = rawUrl.includes('/orgs/');

  const ownerField = isOrg ? 'organization' : 'user';
  const query = `
    query($owner: String!, $number: Int!) {
      ${ownerField}(login: $owner) {
        projectV2(number: $number) {
          title
          shortDescription
          readme
          url
          updatedAt
          creator { login }
          items(first: 100) {
            nodes {
              type
              fieldValues(first: 20) {
                nodes {
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                  ... on ProjectV2ItemFieldDateValue {
                    date
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                  ... on ProjectV2ItemFieldNumberValue {
                    number
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                }
              }
              content {
                ... on Issue {
                  title
                  number
                  state
                  url
                  repository { nameWithOwner }
                }
                ... on PullRequest {
                  title
                  number
                  state
                  url
                  repository { nameWithOwner }
                }
                ... on DraftIssue {
                  title
                  body
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = (await githubGraphQL(accessToken, query, { owner, number })) as {
    organization?: { projectV2: ProjectV2Data | null };
    user?: { projectV2: ProjectV2Data | null };
  };

  const project = isOrg ? data.organization?.projectV2 : data.user?.projectV2;
  if (!project) {
    throw new GitHubContentError('github_not_found', 'Project not found on GitHub.');
  }

  const metadata: GitHubContentMetadata = {
    type: 'project',
    title: project.title,
    owner,
    number,
    state: 'open',
    updatedAt: project.updatedAt,
    author: project.creator?.login ?? 'unknown',
    labels: [],
    url: project.url,
  };

  const parts: string[] = [];
  parts.push(`Project #${number}: ${project.title}`);
  parts.push(`Owner: ${owner}`);
  parts.push(`Author: @${project.creator?.login ?? 'unknown'}`);
  parts.push('');

  if (project.shortDescription) {
    parts.push('## Description');
    parts.push(project.shortDescription);
    parts.push('');
  }

  if (project.readme) {
    parts.push('## Readme');
    parts.push(project.readme);
    parts.push('');
  }

  const items = project.items?.nodes ?? [];
  if (items.length > 0) {
    parts.push(`## Items (${items.length})`);
    for (const item of items) {
      const content = item.content;
      if (!content) continue;

      if ('repository' in content && content.repository) {
        // Issue or PR
        const typeLabel = item.type === 'PULL_REQUEST' ? 'PR' : 'Issue';
        parts.push(`- [${typeLabel}] ${content.repository.nameWithOwner}#${content.number}: ${content.title} (${content.state})`);
      } else if ('body' in content) {
        // Draft issue
        parts.push(`- [Draft] ${content.title}`);
        if (content.body) {
          parts.push(`  ${content.body}`);
        }
      }

      // Add custom field values
      const fields = item.fieldValues?.nodes ?? [];
      const fieldParts: string[] = [];
      for (const field of fields) {
        if (!field || !('field' in field) || !field.field?.name) continue;
        const value = 'text' in field ? field.text
          : 'name' in field ? field.name
          : 'date' in field ? field.date
          : 'number' in field ? String(field.number)
          : null;
        if (value) {
          fieldParts.push(`${field.field.name}: ${value}`);
        }
      }
      if (fieldParts.length > 0) {
        parts.push(`  ${fieldParts.join(' | ')}`);
      }
    }
    parts.push('');
  }

  const text = parts.join('\n');
  const contentHash = await computeHash(text);

  return { metadata, content: { text, contentHash } };
}

// --- GraphQL Types ---

interface ProjectV2Data {
  title: string;
  shortDescription: string | null;
  readme: string | null;
  url: string;
  updatedAt: string;
  creator: { login: string } | null;
  items: {
    nodes: Array<{
      type: string;
      fieldValues: {
        nodes: Array<{
          field?: { name: string } | null;
          text?: string;
          name?: string;
          date?: string;
          number?: number;
        } | null>;
      };
      content: {
        title: string;
        number?: number;
        state?: string;
        url?: string;
        body?: string;
        repository?: { nameWithOwner: string };
      } | null;
    }>;
  } | null;
}

// --- Main Dispatcher ---

/**
 * Fetch content from a GitHub URL.
 * Dispatches to the appropriate handler based on content type.
 */
export async function fetchGitHubContent(
  accessToken: string,
  parsed: ParsedGitHubUrl
): Promise<{ metadata: GitHubContentMetadata; content: GitHubContent }> {
  let result: { metadata: GitHubContentMetadata; content: GitHubContent };

  switch (parsed.type) {
    case 'issue':
      result = await fetchIssueContent(accessToken, parsed.owner, parsed.repo!, parsed.number);
      break;
    case 'pull_request':
      result = await fetchPullRequestContent(accessToken, parsed.owner, parsed.repo!, parsed.number);
      break;
    case 'project':
      result = await fetchProjectContent(accessToken, parsed.owner, parsed.number, parsed.rawUrl);
      break;
  }

  // Check assembled text size
  const textBytes = new TextEncoder().encode(result.content.text).length;
  if (textBytes > MAX_TEXT_SIZE_BYTES) {
    throw new GitHubContentError(
      'github_content_too_large',
      `Content is too large to ingest (${formatBytes(textBytes)}). Maximum supported size is ${formatBytes(MAX_TEXT_SIZE_BYTES)}.`,
      { sizeBytes: textBytes, maxSizeBytes: MAX_TEXT_SIZE_BYTES }
    );
  }

  return result;
}

// --- Utilities ---

async function computeHash(text: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class GitHubContentError extends Error {
  code: string;
  details?: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'GitHubContentError';
  }
}
