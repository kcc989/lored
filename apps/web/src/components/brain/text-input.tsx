'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  LinkIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import type { BulkIngestItem } from './types';

// URL patterns for auto-import
const URL_PATTERNS = [
  {
    regex: /https?:\/\/docs\.google\.com\/document\/d\//,
    label: 'Google Doc',
  },
  {
    regex: /https?:\/\/github\.com\/[^/]+\/[^/]+\/(issues|pull|projects)\//,
    label: 'GitHub',
  },
  {
    regex: /https?:\/\/github\.com\/[^/]+\/[^/]+\/?\s*$/,
    label: 'GitHub Repo',
  },
  {
    regex: /https?:\/\/linear\.app\//,
    label: 'Linear',
  },
];

function detectUrl(text: string): { url: string; label: string } | null {
  const trimmed = text.trim();
  for (const pattern of URL_PATTERNS) {
    if (pattern.regex.test(trimmed)) {
      // Extract just the URL (first line, no trailing whitespace)
      const url = trimmed.split(/\s/)[0];
      return { url, label: pattern.label };
    }
  }
  return null;
}

interface LinkImportStatus {
  url: string;
  label: string;
  status: 'importing' | 'done' | 'error';
  factCount?: number;
  error?: string;
}

interface Props {
  brainId: string;
  onSubmit: (item: BulkIngestItem) => void;
}

export function TextInput({ brainId, onSubmit }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [linkImport, setLinkImport] = useState<LinkImportStatus | null>(null);

  const importMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await fetch(`/api/brains/${brainId}/ingest/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: url }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || 'Import failed'
        );
      }
      return res.json() as Promise<{ factCount?: number }>;
    },
  });

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text');
    const detected = detectUrl(pasted);

    if (detected) {
      e.preventDefault();
      setText('');
      setLinkImport({
        url: detected.url,
        label: detected.label,
        status: 'importing',
      });

      try {
        const result = await importMutation.mutateAsync(detected.url);
        setLinkImport({
          url: detected.url,
          label: detected.label,
          status: 'done',
          factCount: result.factCount,
        });
        toast.success(
          `Imported ${detected.label}: ${result.factCount ?? 0} facts extracted`
        );
        queryClient.invalidateQueries({ queryKey: ['facts', brainId] });
        queryClient.invalidateQueries({ queryKey: ['ingestions', brainId] });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Import failed';
        setLinkImport({
          url: detected.url,
          label: detected.label,
          status: 'error',
          error: msg,
        });
        toast.error(msg);
      }
    }
  };

  const handleAdd = () => {
    if (!text.trim()) return;
    onSubmit({
      type: 'text',
      text: text.trim(),
      title: title.trim() || undefined,
      displayTitle: title.trim() || text.trim().slice(0, 60) + '...',
      provider: 'text',
    });
    setTitle('');
    setText('');
  };

  return (
    <div className="space-y-3 mt-4">
      <Input
        placeholder="Title (optional)"
        value={title}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setTitle(e.target.value)
        }
      />
      <Textarea
        placeholder="Paste text, URLs, or content... Pasting a Google Docs, GitHub, or Linear link will auto-import it."
        rows={6}
        value={text}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
          setText(e.target.value)
        }
        onPaste={handlePaste}
      />

      {/* Link auto-import status */}
      {linkImport && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-xs">
          <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate flex-1">
            {linkImport.label}: {linkImport.url}
          </span>
          {linkImport.status === 'importing' && (
            <span className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
              <Spinner className="size-3" />
              Importing...
            </span>
          )}
          {linkImport.status === 'done' && (
            <span className="flex items-center gap-1.5 shrink-0 text-green-600 dark:text-green-400">
              <CheckCircleIcon className="size-3.5" />
              {linkImport.factCount} facts
            </span>
          )}
          {linkImport.status === 'error' && (
            <span className="flex items-center gap-1.5 shrink-0 text-red-600 dark:text-red-400">
              <WarningCircleIcon className="size-3.5" />
              {linkImport.error}
            </span>
          )}
          <button
            onClick={() => setLinkImport(null)}
            className="shrink-0 text-muted-foreground hover:text-foreground text-[11px] underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <Button onClick={handleAdd} disabled={!text.trim()}>
        Add to queue
      </Button>
    </div>
  );
}
