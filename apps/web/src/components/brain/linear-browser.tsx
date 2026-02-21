'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import type { BulkIngestItem, DiscoveryResult } from './types';

interface Props {
  onSelect: (item: BulkIngestItem) => void;
}

async function fetchTeams(): Promise<DiscoveryResult> {
  const res = await fetch('/api/integrations/linear/teams');
  if (!res.ok) {
    const err = await res.json();
    throw err;
  }
  return res.json();
}

async function fetchIssues(teamId?: string): Promise<DiscoveryResult> {
  const params = new URLSearchParams();
  if (teamId) params.set('teamId', teamId);
  params.set('first', '30');
  const res = await fetch(`/api/integrations/linear/issues?${params}`);
  if (!res.ok) {
    const err = await res.json();
    throw err;
  }
  return res.json();
}

async function fetchProjects(): Promise<DiscoveryResult> {
  const res = await fetch('/api/integrations/linear/projects?first=30');
  if (!res.ok) {
    const err = await res.json();
    throw err;
  }
  return res.json();
}

export function LinearBrowser({ onSelect }: Props) {
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>();
  const [view, setView] = useState<'issues' | 'projects'>('issues');

  const teamsQuery = useQuery({
    queryKey: ['linear-teams'],
    queryFn: fetchTeams,
  });

  const issuesQuery = useQuery({
    queryKey: ['linear-issues', selectedTeamId],
    queryFn: () => fetchIssues(selectedTeamId),
  });

  const projectsQuery = useQuery({
    queryKey: ['linear-projects'],
    queryFn: fetchProjects,
    enabled: view === 'projects',
  });

  if (
    teamsQuery.error &&
    (teamsQuery.error as any).error === 'linear_not_connected'
  ) {
    return (
      <Card className="mt-4">
        <CardContent className="text-center py-6">
          <p className="text-muted-foreground mb-4">
            Connect your Linear account to browse issues.
          </p>
          <Button render={<a href="/api/integrations/linear/connect" />}>
            Connect Linear
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      {/* View toggle + team filter */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={view === 'issues' ? 'default' : 'outline'}
            onClick={() => setView('issues')}
          >
            Issues
          </Button>
          <Button
            size="sm"
            variant={view === 'projects' ? 'default' : 'outline'}
            onClick={() => setView('projects')}
          >
            Projects
          </Button>
        </div>
        {view === 'issues' && teamsQuery.data && (
          <select
            className="rounded-md border border-input bg-input/20 px-2 py-1 text-xs"
            value={selectedTeamId ?? ''}
            onChange={(e) =>
              setSelectedTeamId(e.target.value || undefined)
            }
          >
            <option value="">All teams</option>
            {teamsQuery.data.items.map((team) => (
              <option key={team.id} value={team.id}>
                {team.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Issues list */}
      {view === 'issues' && (
        <>
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
                <p className="text-xs font-medium truncate">{item.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[0.625rem] text-muted-foreground">
                    {(item.metadata as any).state}
                  </span>
                  {(item.metadata as any).team && (
                    <Badge variant="outline">
                      {(item.metadata as any).teamKey}
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  onSelect({
                    type: 'linear',
                    resourceUrl: item.url,
                    displayTitle: item.title,
                    provider: 'linear',
                  })
                }
              >
                Add
              </Button>
            </div>
          ))}
          {issuesQuery.data?.items?.length === 0 && (
            <p className="text-muted-foreground text-xs text-center py-6">
              No issues found.
            </p>
          )}
        </>
      )}

      {/* Projects list */}
      {view === 'projects' && (
        <>
          {projectsQuery.isPending && (
            <div className="flex justify-center py-8">
              <Spinner className="size-5" />
            </div>
          )}
          {projectsQuery.data?.items?.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 rounded-md ring-1 ring-foreground/10"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{item.title}</p>
                <span className="text-[0.625rem] text-muted-foreground">
                  {(item.metadata as any).state}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  onSelect({
                    type: 'linear',
                    resourceUrl: item.url,
                    displayTitle: item.title,
                    provider: 'linear',
                  })
                }
              >
                Add
              </Button>
            </div>
          ))}
          {projectsQuery.data?.items?.length === 0 && (
            <p className="text-muted-foreground text-xs text-center py-6">
              No projects found.
            </p>
          )}
        </>
      )}
    </div>
  );
}
