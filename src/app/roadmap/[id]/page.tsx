"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useRoadmapStore } from "@/stores/roadmap-store";
import * as roadmapsApi from "@/lib/api/roadmaps";
import type { Roadmap } from "@/types/database";
import { TreeView } from "@/components/roadmap/tree-view";
import { CardView } from "@/components/roadmap/card-view";
import { NodeDetail } from "@/components/roadmap/node-detail";
import { Breadcrumbs } from "@/components/roadmap/breadcrumbs";
import { TrashPanel } from "@/components/roadmap/trash-panel";
import { ShortcutsDialog } from "@/components/roadmap/shortcuts-dialog";
import { useKeyboardShortcuts } from "@/components/roadmap/use-keyboard-shortcuts";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export default function RoadmapEditorPage() {
  const params = useParams();
  const router = useRouter();
  const roadmapId = params.id as string;
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const selectedNodeId = useRoadmapStore((s) => s.selectedNodeId);
  const viewMode = useRoadmapStore((s) => s.viewMode);
  const setViewMode = useRoadmapStore((s) => s.setViewMode);

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [trashOpen, setTrashOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const openTrash = useCallback(() => setTrashOpen(true), []);
  const openHelp = useCallback(() => setShortcutsOpen(true), []);

  useKeyboardShortcuts(roadmapId, roadmap?.root_node_id ?? null, openTrash, openHelp);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const roadmaps = await roadmapsApi.fetchRoadmaps();
        if (cancelled) return;
        const found = roadmaps.find((r) => r.id === roadmapId);
        if (!found) {
          router.push("/dashboard");
          return;
        }
        setRoadmap(found);
        await useRoadmapStore.getState().loadNodes(roadmapId);
      } catch (error) {
        console.error("Failed to load roadmap:", error instanceof Error ? error.message : error);
        if (!cancelled) router.push("/dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user, authLoading, roadmapId, router]);

  if (authLoading || loading || !roadmap) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => router.push("/dashboard")}
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
          <Separator orientation="vertical" className="h-5" />
          <h1 className="text-sm font-medium truncate max-w-[300px]">
            {roadmap.title}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex h-8 items-center rounded-md border bg-muted p-0.5">
            <button
              className={cn(
                "flex h-7 items-center gap-1 rounded-sm px-2.5 text-xs font-medium transition-colors",
                viewMode === "list"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setViewMode("list")}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
              List
            </button>
            <button
              className={cn(
                "flex h-7 items-center gap-1 rounded-sm px-2.5 text-xs font-medium transition-colors",
                viewMode === "cards"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setViewMode("cards")}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
              </svg>
              Cards
            </button>
          </div>

          <Separator orientation="vertical" className="h-5" />

          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setTrashOpen(true)}
          >
            <svg
              className="mr-1 h-3.5 w-3.5"
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
            Trash
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-xs"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts (?)"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
            </svg>
          </Button>
        </div>
      </header>

      {/* Breadcrumbs (focus mode) */}
      <Breadcrumbs rootNodeId={roadmap.root_node_id} />

      {/* Main content: view + detail panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* View panel */}
        <div className="flex-1 overflow-hidden border-r">
          {viewMode === "list" ? (
            <TreeView
              roadmapId={roadmapId}
              rootNodeId={roadmap.root_node_id}
            />
          ) : (
            <CardView
              roadmapId={roadmapId}
              rootNodeId={roadmap.root_node_id}
            />
          )}
        </div>

        {/* Detail panel */}
        {selectedNodeId && (
          <div className="w-[340px] shrink-0 overflow-hidden">
            <NodeDetail
              roadmapId={roadmapId}
              rootNodeId={roadmap.root_node_id}
            />
          </div>
        )}
      </div>

      {/* Trash panel */}
      <TrashPanel
        roadmapId={roadmapId}
        open={trashOpen}
        onOpenChange={setTrashOpen}
      />

      {/* Shortcuts help */}
      <ShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
    </div>
  );
}
