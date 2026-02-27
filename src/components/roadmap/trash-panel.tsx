"use client";

import { useEffect } from "react";
import { useRoadmapStore } from "@/stores/roadmap-store";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { NodeSnapshot } from "@/types/database";

interface TrashPanelProps {
  roadmapId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TrashPanel({ roadmapId, open, onOpenChange }: TrashPanelProps) {
  const { trashEntries, loadTrash, restoreTrashEntry, deleteTrashEntry } =
    useRoadmapStore();

  useEffect(() => {
    if (open) {
      loadTrash(roadmapId);
    }
  }, [open, roadmapId, loadTrash]);

  function countSnapshotNodes(snapshot: NodeSnapshot): number {
    let count = 1;
    for (const child of snapshot.children) {
      count += countSnapshotNodes(child);
    }
    return count;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Trash</SheetTitle>
        </SheetHeader>
        <ScrollArea className="mt-4 h-[calc(100vh-8rem)]">
          {trashEntries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Trash is empty
            </p>
          ) : (
            <div className="space-y-2">
              {trashEntries.map((entry) => {
                const snapshot = entry.node_snapshot as NodeSnapshot;
                const nodeCount = countSnapshotNodes(snapshot);
                const daysLeft = Math.max(
                  0,
                  Math.ceil(
                    (new Date(entry.expires_at).getTime() - Date.now()) /
                      (1000 * 60 * 60 * 24)
                  )
                );

                return (
                  <div
                    key={entry.id}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {snapshot.node.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {nodeCount} node{nodeCount !== 1 ? "s" : ""} &middot;{" "}
                        {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() =>
                          restoreTrashEntry(entry.id, roadmapId)
                        }
                      >
                        Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => deleteTrashEntry(entry.id)}
                      >
                        Delete permanently
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
