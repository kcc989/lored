'use client';

import { useMutation } from '@tanstack/react-query';
import { XIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import type { BulkIngestItem } from './types';

const bulkIngestResultSchema = z.object({
  succeeded: z.number(),
  total: z.number(),
});

const errorBodySchema = z.object({
  message: z.string().default('Ingestion failed'),
});

interface Props {
  brainId: string;
  items: BulkIngestItem[];
  onRemove: (index: number) => void;
  onClear: () => void;
}

export function IngestionQueue({ brainId, items, onRemove, onClear }: Props) {
  const mutation = useMutation({
    mutationFn: async () => {
      const payload = items.map(
        ({ displayTitle, provider, ...rest }) => rest
      );
      const res = await fetch(`/api/brains/${brainId}/ingest/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      });
      if (!res.ok) {
        const body = errorBodySchema.parse(
          await res.json().catch(() => ({}))
        );
        throw new Error(body.message);
      }
      return bulkIngestResultSchema.parse(await res.json());
    },
    onSuccess: (data) => {
      toast.success(`Ingested ${data.succeeded} of ${data.total} items`);
      onClear();
    },
    onError: (err: Error) => {
      toast.error(`Ingestion failed: ${err.message}`);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Queue ({items.length}/10)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Select items from the left to add them here.
          </p>
        )}
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-xs"
          >
            <Badge variant="outline" className="shrink-0">
              {item.provider}
            </Badge>
            <span className="truncate flex-1">{item.displayTitle}</span>
            <button
              onClick={() => onRemove(i)}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        ))}
        {items.length > 0 && (
          <div className="pt-3 space-y-2">
            {mutation.isPending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Spinner className="size-3.5" />
                Processing...
              </div>
            )}
            <Button
              className="w-full"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || items.length === 0}
            >
              {mutation.isPending
                ? 'Ingesting...'
                : `Ingest ${items.length} item${items.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
