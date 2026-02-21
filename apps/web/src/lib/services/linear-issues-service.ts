const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

const LINEAR_ISSUE_URL_PATTERN =
  /https?:\/\/linear\.app\/([^/]+)\/issue\/([A-Za-z]+-\d+)/;

const LINEAR_PROJECT_URL_PATTERN =
  /https?:\/\/linear\.app\/([^/]+)\/project\/([^/?#\s]+)/;

export interface LinearContent {
  text: string;
  contentHash: string;
  resourceType: 'issue' | 'project';
  title: string;
  externalId: string;
}

/**
 * Parse a Linear URL into its type (issue or project), workspace, and identifier.
 * Returns null if the URL is not a valid Linear URL.
 */
export function parseLinearUrl(
  url: string
): { type: 'issue' | 'project'; workspace: string; identifier: string } | null {
  const issueMatch = url.match(LINEAR_ISSUE_URL_PATTERN);
  if (issueMatch) {
    return { type: 'issue', workspace: issueMatch[1], identifier: issueMatch[2] };
  }

  const projectMatch = url.match(LINEAR_PROJECT_URL_PATTERN);
  if (projectMatch) {
    return { type: 'project', workspace: projectMatch[1], identifier: projectMatch[2] };
  }

  return null;
}

/**
 * Check if a string contains a Linear URL (issue or project).
 */
export function isLinearUrl(text: string): boolean {
  const trimmed = text.trim();
  return LINEAR_ISSUE_URL_PATTERN.test(trimmed) || LINEAR_PROJECT_URL_PATTERN.test(trimmed);
}

/**
 * Extract a Linear URL from text that may contain one.
 * Returns the first Linear URL found, or null.
 */
export function extractLinearUrl(text: string): string | null {
  const urlPattern = /https?:\/\/linear\.app\/[^/]+\/(?:issue|project)\/[^\s)}\]'"<]+/;
  const match = text.match(urlPattern);
  return match ? match[0] : null;
}

/**
 * Execute a GraphQL query against the Linear API.
 */
async function linearGraphQL<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new LinearIssueError(
      'linear_access_denied',
      'Your Linear account does not have access to this resource.'
    );
  }

  if (!response.ok) {
    throw new LinearIssueError(
      'linear_api_error',
      `Linear API error: ${response.status} ${response.statusText}`
    );
  }

  const result = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string; extensions?: { code?: string } }>;
  };

  if (result.errors?.length) {
    const firstError = result.errors[0];
    const isNotFound =
      firstError.extensions?.code === 'ENTITY_NOT_FOUND' ||
      firstError.message.toLowerCase().includes('not found');
    if (isNotFound) {
      throw new LinearIssueError(
        'linear_not_found',
        'Linear resource not found. Check that the URL is correct.'
      );
    }
    throw new LinearIssueError(
      'linear_api_error',
      `Linear API error: ${firstError.message}`
    );
  }

  if (!result.data) {
    throw new LinearIssueError(
      'linear_api_error',
      'Linear API returned no data'
    );
  }

  return result.data;
}

const ISSUE_QUERY = `
  query IssueByIdentifier($id: String!) {
    issueByIdentifier(id: $id) {
      id
      identifier
      title
      description
      state { name type }
      priority
      priorityLabel
      assignee { name email }
      creator { name email }
      labels { nodes { name } }
      project { name }
      updatedAt
      createdAt
      comments { nodes { body user { name } createdAt } }
    }
  }
`;

interface IssueQueryResult {
  issueByIdentifier: {
    id: string;
    identifier: string;
    title: string;
    description: string | null;
    state: { name: string; type: string };
    priority: number;
    priorityLabel: string;
    assignee: { name: string; email: string } | null;
    creator: { name: string; email: string } | null;
    labels: { nodes: Array<{ name: string }> };
    project: { name: string } | null;
    updatedAt: string;
    createdAt: string;
    comments: {
      nodes: Array<{
        body: string;
        user: { name: string } | null;
        createdAt: string;
      }>;
    };
  } | null;
}

/**
 * Fetch a Linear issue by its identifier (e.g. "ACM-123") and assemble content for ingestion.
 */
export async function fetchLinearIssue(
  accessToken: string,
  identifier: string
): Promise<LinearContent> {
  const data = await linearGraphQL<IssueQueryResult>(
    accessToken,
    ISSUE_QUERY,
    { id: identifier }
  );

  const issue = data.issueByIdentifier;
  if (!issue) {
    throw new LinearIssueError(
      'linear_not_found',
      `Issue ${identifier} not found.`
    );
  }

  // Assemble text content
  const parts: string[] = [];

  parts.push(`# ${issue.identifier}: ${issue.title}`);
  parts.push('');
  parts.push(`State: ${issue.state.name} (${issue.state.type})`);
  parts.push(`Priority: ${issue.priorityLabel}`);

  if (issue.labels.nodes.length > 0) {
    parts.push(`Labels: ${issue.labels.nodes.map((l) => l.name).join(', ')}`);
  }

  if (issue.project) {
    parts.push(`Project: ${issue.project.name}`);
  }

  if (issue.assignee) {
    parts.push(`Assignee: ${issue.assignee.name}${issue.assignee.email ? ` (${issue.assignee.email})` : ''}`);
  }

  if (issue.creator) {
    parts.push(`Creator: ${issue.creator.name}`);
  }

  parts.push(`Created: ${issue.createdAt}`);
  parts.push(`Updated: ${issue.updatedAt}`);

  if (issue.description) {
    parts.push('');
    parts.push('## Description');
    parts.push('');
    parts.push(issue.description);
  }

  if (issue.comments.nodes.length > 0) {
    parts.push('');
    parts.push('## Comments');

    for (const comment of issue.comments.nodes) {
      parts.push('');
      const author = comment.user?.name ?? 'Unknown';
      parts.push(`[Comment by ${author} on ${comment.createdAt}]`);
      parts.push(comment.body);
    }
  }

  const text = parts.join('\n');
  const contentHash = await hashContent(text);

  return {
    text,
    contentHash,
    resourceType: 'issue',
    title: `${issue.identifier}: ${issue.title}`,
    externalId: issue.identifier,
  };
}

const PROJECT_QUERY = `
  query Project($id: String!) {
    project(id: $id) {
      id
      name
      description
      state
      startDate
      targetDate
      lead { name email }
      members { nodes { name email } }
      issues { nodes { identifier title state { name } } }
      updatedAt
    }
  }
`;

interface ProjectQueryResult {
  project: {
    id: string;
    name: string;
    description: string | null;
    state: string;
    startDate: string | null;
    targetDate: string | null;
    lead: { name: string; email: string } | null;
    members: { nodes: Array<{ name: string; email: string }> };
    issues: {
      nodes: Array<{
        identifier: string;
        title: string;
        state: { name: string };
      }>;
    };
    updatedAt: string;
  } | null;
}

/**
 * Fetch a Linear project and assemble content for ingestion.
 * The identifier may be a project slug or UUID.
 */
export async function fetchLinearProject(
  accessToken: string,
  identifier: string
): Promise<LinearContent> {
  const data = await linearGraphQL<ProjectQueryResult>(
    accessToken,
    PROJECT_QUERY,
    { id: identifier }
  );

  const project = data.project;
  if (!project) {
    throw new LinearIssueError(
      'linear_not_found',
      'Project not found. Check that the URL is correct.'
    );
  }

  // Assemble text content
  const parts: string[] = [];

  parts.push(`# Project: ${project.name}`);
  parts.push('');
  parts.push(`State: ${project.state}`);

  if (project.startDate) {
    parts.push(`Start Date: ${project.startDate}`);
  }

  if (project.targetDate) {
    parts.push(`Target Date: ${project.targetDate}`);
  }

  if (project.lead) {
    parts.push(`Lead: ${project.lead.name}${project.lead.email ? ` (${project.lead.email})` : ''}`);
  }

  if (project.description) {
    parts.push('');
    parts.push('## Description');
    parts.push('');
    parts.push(project.description);
  }

  if (project.members.nodes.length > 0) {
    parts.push('');
    parts.push('## Team Members');
    parts.push('');
    for (const member of project.members.nodes) {
      parts.push(`- ${member.name}${member.email ? ` (${member.email})` : ''}`);
    }
  }

  if (project.issues.nodes.length > 0) {
    parts.push('');
    parts.push(`## Issues (${project.issues.nodes.length})`);
    parts.push('');
    for (const issue of project.issues.nodes) {
      parts.push(`- ${issue.identifier}: ${issue.title} [${issue.state.name}]`);
    }
  }

  const text = parts.join('\n');
  const contentHash = await hashContent(text);

  return {
    text,
    contentHash,
    resourceType: 'project',
    title: project.name,
    externalId: project.id,
  };
}

async function hashContent(text: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class LinearIssueError extends Error {
  code: string;
  details?: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'LinearIssueError';
  }
}
