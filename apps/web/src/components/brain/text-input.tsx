'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { BulkIngestItem } from './types';

interface Props {
  onSubmit: (item: BulkIngestItem) => void;
}

export function TextInput({ onSubmit }: Props) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

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
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
      />
      <Textarea
        placeholder="Paste text, URLs, or content..."
        rows={6}
        value={text}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
      />
      <Button onClick={handleAdd} disabled={!text.trim()}>
        Add to queue
      </Button>
    </div>
  );
}
