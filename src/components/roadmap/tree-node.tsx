"use client";

import { useRoadmapStore } from "@/stores/roadmap-store";
import { cn } from "@/lib/utils";
import type { Node } from "@/types/database";

interface TreeNodeProps {
  node: Node;
  depth: number;
  roadmapId: string;
  isRoot?: boolean;
}

export function TreeNode({ node, depth, roadmapId, isRoot }: TreeNodeProps) {
  const {
    selectedNodeId,
    expandedNodes,
    selectNode,
    toggleExpand,
    getChildren,
    getProgress,
    addNode,
  } = useRoadmapStore();

  const children = getChildren(node.id);
  const hasChildren = children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedNodeId === node.id;
  const isLeaf = !hasChildren;
  const progress = getProgress(node.id);
  const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  const handleToggleComplete = (e: React.MouseEvent) => {
    if (!isLeaf) return;
    e.stopPropagation();
    useRoadmapStore.getState().updateNode(node.id, {
      is_completed: !node.is_completed,
    });
  };

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1.5 rounded-md px-2 py-1.5 sm:py-1 cursor-pointer transition-colors",
          isSelected
            ? "bg-accent text-accent-foreground"
            : "hover:bg-accent/50"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => selectNode(node.id)}
      >
        {/* Expand/collapse toggle */}
        <button
          className={cn(
            "flex h-7 w-7 sm:h-5 sm:w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-accent",
            !hasChildren && "invisible"
          )}
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand(node.id);
          }}
        >
          <svg
            className={cn(
              "h-3 w-3 text-muted-foreground transition-transform",
              isExpanded && "rotate-90"
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m8.25 4.5 7.5 7.5-7.5 7.5"
            />
          </svg>
        </button>

        {/* Status indicator / checkbox for leaves */}
        {isLeaf ? (
          <button
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-colors",
              node.is_completed
                ? "border-green-500/60 bg-green-500/15 text-green-600 dark:text-green-400"
                : "border-muted-foreground/30 hover:border-muted-foreground/50"
            )}
            onClick={handleToggleComplete}
            title={node.is_completed ? "Mark as incomplete" : "Mark as complete"}
          >
            {node.is_completed && (
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            )}
          </button>
        ) : (
          <span
            className={cn(
              "flex h-5 shrink-0 items-center rounded-full px-1.5 text-[10px] font-medium tabular-nums",
              percent === 100
                ? "bg-green-500/15 text-green-600 dark:text-green-400"
                : percent > 0
                  ? "bg-muted text-muted-foreground"
                  : "bg-muted text-muted-foreground/60"
            )}
            title={`${progress.completed}/${progress.total} complete`}
          >
            {progress.completed}/{progress.total}
          </span>
        )}

        {/* Title */}
        <span className={cn(
          "flex-1 truncate text-sm",
          isLeaf && node.is_completed && "text-muted-foreground line-through"
        )}>
          {node.title}
        </span>

        {/* Link indicator */}
        {node.link && (
          <span className="shrink-0 text-muted-foreground" title={node.link}>
            <svg
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
              />
            </svg>
          </span>
        )}

        {/* Add child button */}
        <button
          className="flex h-7 w-7 sm:h-5 sm:w-5 shrink-0 items-center justify-center rounded sm:opacity-0 transition-opacity sm:group-hover:opacity-100 hover:bg-accent"
          onClick={(e) => {
            e.stopPropagation();
            addNode(roadmapId, node.id);
          }}
          title="Add child node"
        >
          <svg
            className="h-3 w-3 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              roadmapId={roadmapId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
