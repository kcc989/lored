import {
  getValidGoogleToken,
  GoogleAuthError,
} from '@/lib/services/google-auth-service';
import {
  getValidGitHubToken,
  GitHubAuthError,
} from '@/lib/services/github-auth-service';
import {
  getValidLinearToken,
  LinearAuthError,
} from '@/lib/services/linear-auth-service';

// --- Types ---

export interface DiscoveryItem {
  id: string;
  title: string;
  url: string;
  provider: 'google' | 'github' | 'linear';
  type: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface DiscoveryResult {
  items: DiscoveryItem[];
  nextPageToken?: string;
}

export interface DiscoveryError {
  error: string;
  message: string;
  connectUrl?: string;
}

export interface ListGoogleDocsOptions {
  pageSize?: number;
  pageToken?: string;
  query?: string;
}

export interface ListGitHubReposOptions {
  page?: number;
  perPage?: number;
  sort?: 'updated' | 'pushed' | 'full_name';
}

export interface ListGitHubIssuesOptions {
  owner: string;
  repo: string;
  state?: 'open' | 'closed' | 'all';
  page?: number;
  perPage?: number;
  type?: 'issue' | 'pull_request';
}

export interface ListLinearIssuesOptions {
  teamId?: string;
  projectId?: string;
  first?: number;
  after?: string;
}

export interface ListLinearProjectsOptions {
  first?: number;
  after?: string;
}

// --- Helpers ---

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

function githubHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Lored/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

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

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status}`);
  }

  const result = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (result.errors?.length) {
    throw new Error(`Linear API error: ${result.errors[0].message}`);
  }

  if (!result.data) {
    throw new Error('Linear API returned no data');
  }

  return result.data;
}

// --- Google ---

export async function listGoogleDocuments(
  env: Env,
  userId: string,
  options: ListGoogleDocsOptions = {}
): Promise<DiscoveryResult | DiscoveryError> {
  let accessToken: string;
  try {
    const tokenResult = await getValidGoogleToken(env, userId);
    accessToken = tokenResult.accessToken;
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return {
        error: err.code,
        message: err.message,
        connectUrl: '/api/integrations/google/connect',
      };
    }
    throw err;
  }

  const params = new URLSearchParams();
  let q = "mimeType='application/vnd.google-apps.document'";
  if (options.query) {
    q += ` and name contains '${options.query.replace(/'/g, "\\'")}'`;
  }
  params.set('q', q);
  params.set(
    'fields',
    'nextPageToken,files(id,name,modifiedTime,webViewLink,owners)'
  );
  params.set('orderBy', 'modifiedTime desc');
  params.set('pageSize', String(options.pageSize ?? 20));
  if (options.pageToken) {
    params.set('pageToken', options.pageToken);
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    return {
      error: 'google_api_error',
      message: `Google API error: ${response.status}`,
    };
  }

  const data = (await response.json()) as {
    files: Array<{
      id: string;
      name: string;
      modifiedTime: string;
      webViewLink: string;
      owners?: Array<{ displayName: string; emailAddress: string }>;
    }>;
    nextPageToken?: string;
  };

  return {
    items: data.files.map((file) => ({
      id: file.id,
      title: file.name,
      url: file.webViewLink,
      provider: 'google' as const,
      type: 'document',
      updatedAt: file.modifiedTime,
      metadata: {
        owner: file.owners?.[0]?.displayName ?? null,
        ownerEmail: file.owners?.[0]?.emailAddress ?? null,
      },
    })),
    nextPageToken: data.nextPageToken,
  };
}

// --- GitHub ---

export async function listGitHubRepos(
  env: Env,
  userId: string,
  options: ListGitHubReposOptions = {}
): Promise<DiscoveryResult | DiscoveryError> {
  let accessToken: string;
  try {
    const tokenResult = await getValidGitHubToken(env, userId);
    accessToken = tokenResult.accessToken;
  } catch (err) {
    if (err instanceof GitHubAuthError) {
      return {
        error: err.code,
        message: err.message,
        connectUrl: '/api/integrations/github/connect',
      };
    }
    throw err;
  }

  const params = new URLSearchParams();
  params.set('sort', options.sort ?? 'pushed');
  params.set('per_page', String(options.perPage ?? 20));
  params.set('page', String(options.page ?? 1));

  const response = await fetch(
    `https://api.github.com/user/repos?${params}`,
    { headers: githubHeaders(accessToken) }
  );

  if (!response.ok) {
    return {
      error: 'github_api_error',
      message: `GitHub API error: ${response.status}`,
    };
  }

  const repos = (await response.json()) as Array<{
    id: number;
    full_name: string;
    name: string;
    html_url: string;
    description: string | null;
    private: boolean;
    language: string | null;
    pushed_at: string;
    owner: { login: string };
  }>;

  return {
    items: repos.map((repo) => ({
      id: repo.full_name,
      title: repo.full_name,
      url: repo.html_url,
      provider: 'github' as const,
      type: 'repo',
      updatedAt: repo.pushed_at,
      metadata: {
        owner: repo.owner.login,
        name: repo.name,
        description: repo.description,
        private: repo.private,
        language: repo.language,
      },
    })),
  };
}

export async function listGitHubIssues(
  env: Env,
  userId: string,
  options: ListGitHubIssuesOptions
): Promise<DiscoveryResult | DiscoveryError> {
  let accessToken: string;
  try {
    const tokenResult = await getValidGitHubToken(env, userId);
    accessToken = tokenResult.accessToken;
  } catch (err) {
    if (err instanceof GitHubAuthError) {
      return {
        error: err.code,
        message: err.message,
        connectUrl: '/api/integrations/github/connect',
      };
    }
    throw err;
  }

  const params = new URLSearchParams();
  params.set('state', options.state ?? 'open');
  params.set('per_page', String(options.perPage ?? 20));
  params.set('page', String(options.page ?? 1));
  params.set('sort', 'updated');
  params.set('direction', 'desc');

  const response = await fetch(
    `https://api.github.com/repos/${options.owner}/${options.repo}/issues?${params}`,
    { headers: githubHeaders(accessToken) }
  );

  if (!response.ok) {
    return {
      error: 'github_api_error',
      message: `GitHub API error: ${response.status}`,
    };
  }

  const items = (await response.json()) as Array<{
    id: number;
    number: number;
    title: string;
    html_url: string;
    state: string;
    updated_at: string;
    user: { login: string } | null;
    labels: Array<{ name: string }>;
    pull_request?: { url: string };
  }>;

  const filtered = items.filter((item) => {
    if (options.type === 'issue') return !item.pull_request;
    if (options.type === 'pull_request') return !!item.pull_request;
    return true;
  });

  return {
    items: filtered.map((item) => ({
      id: `${options.owner}/${options.repo}/${item.pull_request ? 'pull' : 'issues'}/${item.number}`,
      title: `#${item.number}: ${item.title}`,
      url: item.html_url,
      provider: 'github' as const,
      type: item.pull_request ? 'pull_request' : 'issue',
      updatedAt: item.updated_at,
      metadata: {
        number: item.number,
        state: item.state,
        author: item.user?.login ?? null,
        labels: item.labels.map((l) => l.name),
      },
    })),
  };
}

// --- Linear ---

export async function listLinearTeams(
  env: Env,
  userId: string
): Promise<DiscoveryResult | DiscoveryError> {
  let accessToken: string;
  try {
    const tokenResult = await getValidLinearToken(env, userId);
    accessToken = tokenResult.accessToken;
  } catch (err) {
    if (err instanceof LinearAuthError) {
      return {
        error: err.code,
        message: err.message,
        connectUrl: '/api/integrations/linear/connect',
      };
    }
    throw err;
  }

  const data = await linearGraphQL<{
    teams: { nodes: Array<{ id: string; name: string; key: string }> };
  }>(accessToken, `query { teams { nodes { id name key } } }`);

  return {
    items: data.teams.nodes.map((team) => ({
      id: team.id,
      title: `${team.key} - ${team.name}`,
      url: `https://linear.app/team/${team.key}`,
      provider: 'linear' as const,
      type: 'team',
      updatedAt: new Date().toISOString(),
      metadata: { key: team.key },
    })),
  };
}

export async function listLinearIssues(
  env: Env,
  userId: string,
  options: ListLinearIssuesOptions = {}
): Promise<DiscoveryResult | DiscoveryError> {
  let accessToken: string;
  try {
    const tokenResult = await getValidLinearToken(env, userId);
    accessToken = tokenResult.accessToken;
  } catch (err) {
    if (err instanceof LinearAuthError) {
      return {
        error: err.code,
        message: err.message,
        connectUrl: '/api/integrations/linear/connect',
      };
    }
    throw err;
  }

  const filterParts: string[] = [];
  if (options.teamId) {
    filterParts.push(`team: { id: { eq: "${options.teamId}" } }`);
  }
  if (options.projectId) {
    filterParts.push(`project: { id: { eq: "${options.projectId}" } }`);
  }
  const filterArg =
    filterParts.length > 0
      ? `, filter: { ${filterParts.join(', ')} }`
      : '';

  const query = `
    query($first: Int, $after: String) {
      issues(first: $first, after: $after, orderBy: updatedAt${filterArg}) {
        nodes {
          id
          identifier
          title
          url
          state { name }
          updatedAt
          team { name key }
          project { name }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;

  const data = await linearGraphQL<{
    issues: {
      nodes: Array<{
        id: string;
        identifier: string;
        title: string;
        url: string;
        state: { name: string };
        updatedAt: string;
        team: { name: string; key: string };
        project: { name: string } | null;
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(accessToken, query, {
    first: options.first ?? 20,
    after: options.after ?? null,
  });

  return {
    items: data.issues.nodes.map((issue) => ({
      id: issue.identifier,
      title: `${issue.identifier}: ${issue.title}`,
      url: issue.url,
      provider: 'linear' as const,
      type: 'issue',
      updatedAt: issue.updatedAt,
      metadata: {
        state: issue.state.name,
        team: issue.team.name,
        teamKey: issue.team.key,
        project: issue.project?.name ?? null,
      },
    })),
    nextPageToken: data.issues.pageInfo.hasNextPage
      ? (data.issues.pageInfo.endCursor ?? undefined)
      : undefined,
  };
}

export async function listLinearProjects(
  env: Env,
  userId: string,
  options: ListLinearProjectsOptions = {}
): Promise<DiscoveryResult | DiscoveryError> {
  let accessToken: string;
  try {
    const tokenResult = await getValidLinearToken(env, userId);
    accessToken = tokenResult.accessToken;
  } catch (err) {
    if (err instanceof LinearAuthError) {
      return {
        error: err.code,
        message: err.message,
        connectUrl: '/api/integrations/linear/connect',
      };
    }
    throw err;
  }

  const query = `
    query($first: Int, $after: String) {
      projects(first: $first, after: $after, orderBy: updatedAt) {
        nodes {
          id
          name
          url
          state
          updatedAt
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;

  const data = await linearGraphQL<{
    projects: {
      nodes: Array<{
        id: string;
        name: string;
        url: string;
        state: string;
        updatedAt: string;
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(accessToken, query, {
    first: options.first ?? 20,
    after: options.after ?? null,
  });

  return {
    items: data.projects.nodes.map((project) => ({
      id: project.id,
      title: project.name,
      url: project.url,
      provider: 'linear' as const,
      type: 'project',
      updatedAt: project.updatedAt,
      metadata: { state: project.state },
    })),
    nextPageToken: data.projects.pageInfo.hasNextPage
      ? (data.projects.pageInfo.endCursor ?? undefined)
      : undefined,
  };
}
