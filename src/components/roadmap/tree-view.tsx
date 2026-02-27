"use client";

import { useRoadmapStore } from "@/stores/roadmap-store";
import { TreeNode } from "./tree-node";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TreeViewProps {
  roadmapId: string;
  rootNodeId: string | null;
}

export function TreeView({ roadmapId, rootNodeId }: TreeViewProps) {
  const { nodes, loading, focusedNodeId } = useRoadmapStore();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading nodes...</p>
      </div>
    );
  }

  // Determine the effective root for rendering
  const effectiveRootId = focusedNodeId || rootNodeId;
  const rootNode = effectiveRootId ? nodes.get(effectiveRootId) : null;

  if (!rootNode) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">No nodes found</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-2">
        <TreeNode
          node={rootNode}
          depth={0}
          roadmapId={roadmapId}
          isRoot
        />
      </div>
    </ScrollArea>
  );
}
