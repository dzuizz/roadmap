"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRoadmapStore } from "@/stores/roadmap-store";
import { ProgressBar } from "./progress-bar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface NodeDetailProps {
  roadmapId: string;
  rootNodeId: string | null;
}

export function NodeDetail({ roadmapId, rootNodeId }: NodeDetailProps) {
  const {
    nodes,
    selectedNodeId,
    selectNode,
    updateNode,
    deleteNode,
    getChildren,
    getDescendantCount,
    saving,
  } = useRoadmapStore();

  const node = selectedNodeId ? nodes.get(selectedNodeId) : null;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync local state when selected node changes
  useEffect(() => {
    if (node) {
      setTitle(node.title);
      setDescription(node.description || "");
      setLink(node.link || "");
    }
  }, [node?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const debouncedUpdate = useCallback(
    (field: string, value: string) => {
      if (!selectedNodeId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateNode(selectedNodeId, { [field]: value || null });
      }, 500);
    },
    [selectedNodeId, updateNode]
  );

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          Select a node to view details
        </p>
      </div>
    );
  }

  const isRoot = node.id === rootNodeId;
  const childCount = getChildren(node.id).length;
  const descendantCount = getDescendantCount(node.id);

  // Listen for keyboard-triggered delete requests
  useEffect(() => {
    function onRequestDelete() {
      if (!isRoot) setDeleteDialogOpen(true);
    }
    window.addEventListener("roadmap:request-delete", onRequestDelete);
    return () => window.removeEventListener("roadmap:request-delete", onRequestDelete);
  }, [isRoot]);

  const handleDelete = () => {
    deleteNode(node.id, roadmapId);
    setDeleteDialogOpen(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 sm:hidden"
            onClick={() => selectNode(null)}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
              />
            </svg>
          </Button>
          <h3 className="text-sm font-medium">Node Details</h3>
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-xs text-muted-foreground">Saving...</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hidden sm:flex"
            onClick={() => selectNode(null)}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Title */}
        <div className="space-y-1.5">
          <Label htmlFor="node-title" className="text-xs">
            Title
          </Label>
          <Input
            id="node-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              debouncedUpdate("title", e.target.value);
            }}
            placeholder="Node title"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="node-description" className="text-xs">
            Description
          </Label>
          <Textarea
            id="node-description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              debouncedUpdate("description", e.target.value);
            }}
            placeholder="Add a description..."
            rows={4}
          />
        </div>

        {/* Link */}
        <div className="space-y-1.5">
          <Label htmlFor="node-link" className="text-xs">
            Link
          </Label>
          <Input
            id="node-link"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              debouncedUpdate("link", e.target.value);
            }}
            placeholder="https://..."
            type="url"
          />
          {node.link && (
            <a
              href={node.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Open link
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
                  d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
            </a>
          )}
        </div>

        <Separator />

        {/* Progress */}
        <div className="space-y-1.5">
          <Label className="text-xs">Progress</Label>
          <ProgressBar nodeId={node.id} />
        </div>

        <Separator />

        {/* Metadata */}
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Children</span>
            <span>{childCount}</span>
          </div>
          {descendantCount > childCount && (
            <div className="flex justify-between">
              <span>Total descendants</span>
              <span>{descendantCount}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Created</span>
            <span>
              {new Date(node.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>

        <Separator />

        {/* Delete */}
        {!isRoot && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <svg
              className="mr-1.5 h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
              />
            </svg>
            Delete node
          </Button>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{node.title}&rdquo;
              {descendantCount > 0 ? " and its subtree?" : "?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {descendantCount > 0 ? (
                <>
                  This node has{" "}
                  <span className="font-semibold">{childCount} direct children</span>
                  {descendantCount > childCount && (
                    <>
                      {" "}and{" "}
                      <span className="font-semibold">
                        {descendantCount} total descendants
                      </span>
                    </>
                  )}
                  . All of them will be moved to the trash.
                  <br />
                  <br />
                  You can restore deleted nodes from the trash for 30 days.
                </>
              ) : (
                "This node will be moved to the trash. You can restore it within 30 days."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
