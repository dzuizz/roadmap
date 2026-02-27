"use client";

import { useRoadmapStore } from "@/stores/roadmap-store";

interface BreadcrumbsProps {
  rootNodeId: string | null;
}

export function Breadcrumbs({ rootNodeId }: BreadcrumbsProps) {
  const { nodes, focusedNodeId, setFocus } = useRoadmapStore();

  if (!focusedNodeId || focusedNodeId === rootNodeId) return null;

  // Build path from root to focused node
  const path: { id: string; title: string }[] = [];
  let currentId: string | null = focusedNodeId;

  while (currentId) {
    const node = nodes.get(currentId);
    if (!node) break;
    path.unshift({ id: node.id, title: node.title });
    currentId = node.parent_id;
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-4 py-1.5 text-xs border-b bg-muted/30">
      <button
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setFocus(null)}
      >
        Root
      </button>
      {path.map((item, i) => (
        <span key={item.id} className="flex items-center gap-1">
          <svg
            className="h-3 w-3 text-muted-foreground/50 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          {i === path.length - 1 ? (
            <span className="font-medium truncate">{item.title}</span>
          ) : (
            <button
              className="text-muted-foreground hover:text-foreground transition-colors truncate"
              onClick={() => setFocus(item.id)}
            >
              {item.title}
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
