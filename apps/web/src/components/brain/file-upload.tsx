'use client';

import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  FileIcon,
  UploadSimpleIcon,
  XIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const ACCEPT_STRING =
  '.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.pdf,.docx';

const MAX_SIZE = 20 * 1024 * 1024; // 20MB

interface FileStatus {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  factCount?: number;
}

interface Props {
  brainId: string;
}

export function FileUpload({ brainId }: Props) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (fileStatus: FileStatus) => {
      const form = new FormData();
      form.append('file', fileStatus.file);

      const res = await fetch(`/api/brains/${brainId}/ingest/file`, {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || 'Upload failed'
        );
      }

      return res.json() as Promise<{ factCount?: number }>;
    },
  });

  const addFiles = (newFiles: FileList | File[]) => {
    const additions: FileStatus[] = [];
    for (const file of Array.from(newFiles)) {
      if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(md|txt)$/i)) {
        toast.error(`Unsupported file type: ${file.name}`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        toast.error(`File too large (max 20MB): ${file.name}`);
        continue;
      }
      // Deduplicate
      if (files.some((f) => f.file.name === file.name && f.file.size === file.size)) {
        continue;
      }
      additions.push({ file, status: 'pending' });
    }
    if (additions.length > 0) {
      setFiles((prev) => [...prev, ...additions]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadAll = async () => {
    const pending = files.filter((f) => f.status === 'pending');
    if (pending.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.status !== 'pending') continue;

      setFiles((prev) =>
        prev.map((item, idx) =>
          idx === i ? { ...item, status: 'uploading' } : item
        )
      );

      try {
        const result = await uploadMutation.mutateAsync(f);
        setFiles((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? { ...item, status: 'done', factCount: result.factCount }
              : item
          )
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: 'error',
                  error: err instanceof Error ? err.message : 'Upload failed',
                }
              : item
          )
        );
      }
    }

    queryClient.invalidateQueries({ queryKey: ['facts', brainId] });
    queryClient.invalidateQueries({ queryKey: ['ingestions', brainId] });
    toast.success('Upload complete');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const hasPending = files.some((f) => f.status === 'pending');
  const hasUploading = files.some((f) => f.status === 'uploading');

  return (
    <div className="space-y-3 mt-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50'
        }`}
      >
        <UploadSimpleIcon className="size-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-xs text-foreground font-medium">
          Drop files here or click to browse
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          PNG, JPEG, GIF, WebP, TXT, Markdown, PDF, Word (.docx) &mdash; max
          20MB
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_STRING}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f, i) => (
            <div
              key={`${f.file.name}-${i}`}
              className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/50 text-xs"
            >
              <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1">{f.file.name}</span>
              <span className="text-muted-foreground shrink-0">
                {formatSize(f.file.size)}
              </span>
              {f.status === 'uploading' && (
                <Spinner className="size-3.5 shrink-0" />
              )}
              {f.status === 'done' && (
                <CheckCircleIcon className="size-3.5 shrink-0 text-green-600 dark:text-green-400" />
              )}
              {f.status === 'error' && (
                <WarningCircleIcon className="size-3.5 shrink-0 text-red-600 dark:text-red-400" />
              )}
              {f.factCount !== undefined && (
                <span className="text-muted-foreground shrink-0">
                  {f.factCount} facts
                </span>
              )}
              {f.status === 'pending' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(i);
                  }}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {files.length > 0 && (
        <div className="flex gap-2">
          <Button
            onClick={uploadAll}
            disabled={!hasPending || hasUploading}
          >
            {hasUploading ? (
              <span className="flex items-center gap-2">
                <Spinner className="size-3.5" />
                Uploading...
              </span>
            ) : (
              `Upload ${files.filter((f) => f.status === 'pending').length} file${files.filter((f) => f.status === 'pending').length !== 1 ? 's' : ''}`
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => setFiles([])}
            disabled={hasUploading}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
