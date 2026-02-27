"use client";

import { useRoadmapStore } from "@/stores/roadmap-store";
import { ProgressBar } from "./progress-bar";
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
    addNode,
  } = useRoadmapStore();

  const children = getChildren(node.id);
  const hasChildren = children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedNodeId === node.id;

  return (
    <div>
      <div
        className={cn(
          "group flex flex-col rounded-md px-2 py-1 cursor-pointer transition-colors",
          isSelected
            ? "bg-accent text-accent-foreground"
            : "hover:bg-accent/50"
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => selectNode(node.id)}
      >
        {/* Top row: expand toggle, title, actions */}
        <div className="flex items-center gap-1">
          {/* Expand/collapse toggle */}
          <button
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-accent",
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

          {/* Title */}
          <span className="flex-1 truncate text-sm">
            {node.title}
          </span>

          {/* Add child button */}
          <button
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent"
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
        </div>

        {/* Progress bar row */}
        <div className="pl-6 pr-1 pb-0.5">
          <ProgressBar nodeId={node.id} />
        </div>
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
