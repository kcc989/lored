'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import type { BulkIngestItem, DiscoveryResult } from './types';

interface Props {
  onSelect: (item: BulkIngestItem) => void;
}

async function fetchRepos(): Promise<DiscoveryResult> {
  const res = await fetch('/api/integrations/github/repos?perPage=30');
  if (!res.ok) {
    const err = await res.json();
    throw err;
  }
  return res.json();
}

async function fetchIssues(
  owner: string,
  repo: string
): Promise<DiscoveryResult> {
  const res = await fetch(
    `/api/integrations/github/repos/${owner}/${repo}/issues?perPage=30`
  );
  if (!res.ok) {
    const err = await res.json();
    throw err;
  }
  return res.json();
}

export function GitHubBrowser({ onSelect }: Props) {
  const [selectedRepo, setSelectedRepo] = useState<{
    owner: string;
    name: string;
  } | null>(null);

  const reposQuery = useQuery({
    queryKey: ['github-repos'],
    queryFn: fetchRepos,
  });

  const issuesQuery = useQuery({
    queryKey: ['github-issues', selectedRepo?.owner, selectedRepo?.name],
    queryFn: () => fetchIssues(selectedRepo!.owner, selectedRepo!.name),
    enabled: !!selectedRepo,
  });

  if (
    reposQuery.error &&
    (reposQuery.error as any).error === 'github_not_connected'
  ) {
    return (
      <Card className="mt-4">
        <CardContent className="text-center py-6">
          <p className="text-muted-foreground mb-4">
            Connect your GitHub account to browse repos.
          </p>
          <Button render={<a href="/api/integrations/github/connect" />}>
            Connect GitHub
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Show issues for selected repo
  if (selectedRepo) {
    return (
      <div className="space-y-3 mt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedRepo(null)}
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to repos
        </Button>
        <p className="text-xs font-medium">
          {selectedRepo.owner}/{selectedRepo.name}
        </p>
        {issuesQuery.isPending && (
          <div className="flex justify-center py-8">
            <Spinner className="size-5" />
          </div>
        )}
        {issuesQuery.data?.items?.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 rounded-md ring-1 ring-foreground/10"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium truncate">{item.title}</p>
                <Badge variant="outline">
                  {item.type === 'pull_request' ? 'PR' : 'Issue'}
                </Badge>
              </div>
              <p className="text-[0.625rem] text-muted-foreground">
                {(item.metadata as any).state} &middot; Updated{' '}
                {new Date(item.updatedAt).toLocaleDateString()}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                onSelect({
                  type: 'github',
                  contentUrl: item.url,
                  displayTitle: item.title,
                  provider: 'github',
                })
              }
            >
              Add
            </Button>
          </div>
        ))}
        {issuesQuery.data?.items?.length === 0 && (
          <p className="text-muted-foreground text-xs text-center py-6">
            No issues or PRs found.
          </p>
        )}
      </div>
    );
  }

  // Show repos list
  return (
    <div className="space-y-3 mt-4">
      {reposQuery.isPending && (
        <div className="flex justify-center py-8">
          <Spinner className="size-5" />
        </div>
      )}
      {reposQuery.data?.items?.map((item) => (
        <button
          key={item.id}
          onClick={() =>
            setSelectedRepo({
              owner: (item.metadata as any).owner,
              name: (item.metadata as any).name,
            })
          }
          className="flex items-center justify-between w-full p-3 rounded-md ring-1 ring-foreground/10 text-left hover:bg-muted/50 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{item.title}</p>
            <p className="text-[0.625rem] text-muted-foreground truncate">
              {(item.metadata as any).description || 'No description'}
            </p>
          </div>
          {(item.metadata as any).language && (
            <Badge variant="outline">
              {(item.metadata as any).language}
            </Badge>
          )}
        </button>
      ))}
    </div>
  );
}
