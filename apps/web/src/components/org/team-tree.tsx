'use client';

import { CaretRightIcon, UsersIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

type Team = {
  id: string;
  name: string;
  parentTeamId: string | null;
};

type TeamNode = Team & {
  children: TeamNode[];
};

function buildTree(teams: Team[]): TeamNode[] {
  const map = new Map<string, TeamNode>();
  const roots: TeamNode[] = [];

  for (const team of teams) {
    map.set(team.id, { ...team, children: [] });
  }

  for (const team of teams) {
    const node = map.get(team.id)!;
    if (team.parentTeamId && map.has(team.parentTeamId)) {
      map.get(team.parentTeamId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function TeamNodeItem({
  node,
  activeTeamId,
  onSelect,
  depth = 0,
}: {
  node: TeamNode;
  activeTeamId: string | null;
  onSelect: (teamId: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isActive = node.id === activeTeamId;

  return (
    <div>
      <button
        className={cn(
          'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors',
          isActive
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-foreground/70 hover:bg-accent/50 hover:text-foreground'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <button
            className="p-0.5 hover:bg-accent rounded"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <CaretRightIcon
              className={cn(
                'w-3 h-3 transition-transform',
                expanded && 'rotate-90'
              )}
            />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <UsersIcon className="w-4 h-4 shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <TeamNodeItem
              key={child.id}
              node={child}
              activeTeamId={activeTeamId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type TeamTreeProps = {
  teams: Team[];
  activeTeamId: string | null;
  onSelectTeam: (teamId: string) => void;
};

export function TeamTree({ teams, activeTeamId, onSelectTeam }: TeamTreeProps) {
  const tree = buildTree(teams);

  if (teams.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">No teams yet</p>
    );
  }

  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <TeamNodeItem
          key={node.id}
          node={node}
          activeTeamId={activeTeamId}
          onSelect={onSelectTeam}
        />
      ))}
    </div>
  );
}
