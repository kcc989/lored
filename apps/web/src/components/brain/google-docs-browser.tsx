'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import type { BulkIngestItem, DiscoveryResult } from './types';

interface Props {
  onSelect: (item: BulkIngestItem) => void;
}

async function fetchGoogleDocs(
  query?: string,
  pageToken?: string
): Promise<DiscoveryResult> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (pageToken) params.set('pageToken', pageToken);
  params.set('pageSize', '20');
  const res = await fetch(`/api/integrations/google/documents?${params}`);
  if (!res.ok) {
    const err = await res.json();
    throw err;
  }
  return res.json();
}

export function GoogleDocsBrowser({ onSelect }: Props) {
  const [search, setSearch] = useState('');

  const { data, isPending, error } = useQuery({
    queryKey: ['google-docs', search],
    queryFn: () => fetchGoogleDocs(search || undefined),
  });

  if (error && (error as any).error === 'google_not_connected') {
    return (
      <Card className="mt-4">
        <CardContent className="text-center py-6">
          <p className="text-muted-foreground mb-4">
            Connect your Google account to browse documents.
          </p>
          <Button render={<a href="/api/integrations/google/connect" />}>
            Connect Google
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      <Input
        placeholder="Search documents..."
        value={search}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
      />
      {isPending && (
        <div className="flex justify-center py-8">
          <Spinner className="size-5" />
        </div>
      )}
      {error && !('error' in (error as any)) && (
        <p className="text-destructive text-xs">Failed to load documents.</p>
      )}
      {data?.items?.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between p-3 rounded-md ring-1 ring-foreground/10"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{item.title}</p>
            <p className="text-[0.625rem] text-muted-foreground">
              Updated{' '}
              {new Date(item.updatedAt).toLocaleDateString()}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onSelect({
                type: 'google_doc',
                documentUrl: item.url,
                displayTitle: item.title,
                provider: 'google',
              })
            }
          >
            Add
          </Button>
        </div>
      ))}
      {data?.items?.length === 0 && !isPending && (
        <p className="text-muted-foreground text-xs text-center py-6">
          No documents found.
        </p>
      )}
    </div>
  );
}
