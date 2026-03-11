"use client";

import { useRoadmapStore } from "@/stores/roadmap-store";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  nodeId: string;
  className?: string;
}

export function ProgressBar({ nodeId, className }: ProgressBarProps) {
  const nodes = useRoadmapStore((s) => s.nodes);
  const getProgress = useRoadmapStore((s) => s.getProgress);
  const getChildren = useRoadmapStore((s) => s.getChildren);

  const node = nodes.get(nodeId);
  if (!node) return null;

  const children = getChildren(nodeId);
  const isLeaf = children.length === 0;
  const progress = getProgress(nodeId);
  const percent = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

  const handleClick = (e: React.MouseEvent) => {
    if (!isLeaf) return;
    e.stopPropagation();
    useRoadmapStore.getState().updateNode(nodeId, {
      isCompleted: !node.isCompleted,
    });
  };

  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      onClick={isLeaf ? handleClick : undefined}
      role={isLeaf ? "button" : undefined}
      tabIndex={isLeaf ? 0 : undefined}
      onKeyDown={isLeaf ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(e as unknown as React.MouseEvent); } } : undefined}
      title={isLeaf ? (node.isCompleted ? "Mark as incomplete" : "Mark as complete") : `${progress.completed}/${progress.total} complete`}
    >
      {/* Enlarged click target: py-1 gives 8px above + below the 6px bar = 22px total hit area */}
      <div
        className={cn(
          "flex-1 min-w-[40px] py-1",
          isLeaf && "cursor-pointer group/bar"
        )}
      >
        <div
          className={cn(
            "h-1.5 rounded-full bg-muted overflow-hidden transition-colors",
            isLeaf && "group-hover/bar:bg-muted-foreground/20"
          )}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              percent === 100
                ? "bg-green-500/70 dark:bg-green-400/60"
                : percent > 0
                  ? "bg-green-500/50 dark:bg-green-400/40"
                  : isLeaf
                    ? "bg-transparent"
                    : "bg-transparent"
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      {isLeaf ? (
        <span className={cn(
          "shrink-0 text-[10px] tabular-nums",
          node.isCompleted ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
        )}>
          {node.isCompleted ? "Done" : "Todo"}
        </span>
      ) : (
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {progress.completed}/{progress.total}
        </span>
      )}
    </div>
  );
}
