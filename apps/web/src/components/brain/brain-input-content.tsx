'use client';

import { useState } from 'react';

import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import { GoogleDocsBrowser } from './google-docs-browser';
import { GitHubBrowser } from './github-browser';
import { LinearBrowser } from './linear-browser';
import { TextInput } from './text-input';
import { IngestionQueue } from './ingestion-queue';
import type { BulkIngestItem } from './types';

interface Props {
  brainId: string;
}

export function BrainInputContent({ brainId }: Props) {
  const [selectedItems, setSelectedItems] = useState<BulkIngestItem[]>([]);

  const addItem = (item: BulkIngestItem) => {
    if (selectedItems.length >= 10) return;
    // Deduplicate by URL or text content
    const key =
      item.documentUrl || item.contentUrl || item.resourceUrl || item.text;
    if (
      selectedItems.some(
        (i) =>
          (i.documentUrl || i.contentUrl || i.resourceUrl || i.text) === key
      )
    )
      return;
    setSelectedItems((prev) => [...prev, item]);
  };

  const removeItem = (index: number) => {
    setSelectedItems((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left: Source browser */}
      <div className="lg:col-span-2">
        <Tabs defaultValue={0}>
          <TabsList>
            <TabsTrigger value={0}>Google Docs</TabsTrigger>
            <TabsTrigger value={1}>GitHub</TabsTrigger>
            <TabsTrigger value={2}>Linear</TabsTrigger>
            <TabsTrigger value={3}>Text</TabsTrigger>
          </TabsList>
          <TabsContent value={0}>
            <GoogleDocsBrowser onSelect={addItem} />
          </TabsContent>
          <TabsContent value={1}>
            <GitHubBrowser onSelect={addItem} />
          </TabsContent>
          <TabsContent value={2}>
            <LinearBrowser onSelect={addItem} />
          </TabsContent>
          <TabsContent value={3}>
            <TextInput onSubmit={addItem} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Right: Selected items queue */}
      <div>
        <IngestionQueue
          brainId={brainId}
          items={selectedItems}
          onRemove={removeItem}
          onClear={() => setSelectedItems([])}
        />
      </div>
    </div>
  );
}
