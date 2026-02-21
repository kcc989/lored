'use client';

import { useState } from 'react';
import { CaretRightIcon, CaretDownIcon } from '@phosphor-icons/react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TopicHierarchyNode } from './types';

interface Props {
  nodes: TopicHierarchyNode[];
  depth?: number;
}

export function TopicTree({ nodes, depth = 0 }: Props) {
  return (
    <div
      className={cn(
        'space-y-1',
        depth > 0 && 'ml-5 border-l border-border pl-3'
      )}
    >
      {nodes.map((node) => (
        <TopicNode key={node.topicId} node={node} depth={depth} />
      ))}
    </div>
  );
}

function TopicNode({
  node,
  depth,
}: {
  node: TopicHierarchyNode;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-2 w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors"
      >
        <span className="mt-0.5 shrink-0">
          {hasChildren ? (
            expanded ? (
              <CaretDownIcon className="size-3.5" />
            ) : (
              <CaretRightIcon className="size-3.5" />
            )
          ) : (
            <span className="size-3.5 inline-block" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium">{node.name}</span>
            <Badge variant="outline">{node.factCount} facts</Badge>
          </div>
          {expanded && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted-foreground">{node.summary}</p>
              {node.keyInsights.length > 0 && (
                <ul className="text-[0.625rem] text-muted-foreground space-y-0.5">
                  {node.keyInsights.map((insight, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-primary shrink-0">&bull;</span>
                      {insight}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </button>
      {expanded && hasChildren && (
        <TopicTree nodes={node.children} depth={depth + 1} />
      )}
    </div>
  );
}
