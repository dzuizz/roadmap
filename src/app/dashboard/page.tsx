"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import * as roadmapsApi from "@/lib/api/roadmaps";
import type { Roadmap } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuthStore();
  const [roadmaps, setRoadmaps] = useState<(Roadmap & { role?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Roadmap | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const loadRoadmaps = useCallback(async () => {
    try {
      const data = await roadmapsApi.fetchRoadmaps();
      setRoadmaps(data);
    } catch (error) {
      console.error("Failed to load roadmaps:", error instanceof Error ? error.message : error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      loadRoadmaps();
    }
  }, [user, authLoading, router, loadRoadmaps]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      const roadmap = await roadmapsApi.createRoadmap(
        newTitle.trim(),
        newDescription.trim() || undefined
      );
      setRoadmaps((prev) => [roadmap, ...prev]);
      setCreateOpen(false);
      setNewTitle("");
      setNewDescription("");
      router.push(`/roadmap/${roadmap.id}`);
    } catch (error) {
      console.error("Failed to create roadmap:", error instanceof Error ? error.message : error);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await roadmapsApi.deleteRoadmap(deleteTarget.id);
      setRoadmaps((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteConfirmText("");
    } catch (error) {
      console.error("Failed to delete roadmap:", error);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <h1 className="text-lg font-semibold">Ada Roadmap</h1>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden sm:inline text-sm text-muted-foreground">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <div className="mb-4 sm:mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Your Roadmaps</h2>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusIcon />
                New Roadmap
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Roadmap</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Backend Engineering Path"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                    }}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="What is this roadmap about?"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setCreateOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={!newTitle.trim()}>
                    Create
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {roadmaps.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
            <p className="mb-1 text-sm font-medium">No roadmaps yet</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Create your first roadmap to get started
            </p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <PlusIcon />
              New Roadmap
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {roadmaps.map((roadmap) => (
              <div
                key={roadmap.id}
                className="group flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-accent"
                onClick={() => router.push(`/roadmap/${roadmap.id}`)}
              >
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">
                    {roadmap.title}
                    {roadmap.role && roadmap.role !== "owner" && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Shared
                      </span>
                    )}
                  </h3>
                  {roadmap.description && (
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {roadmap.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Updated{" "}
                    {new Date(roadmap.updatedAt).toLocaleDateString(
                      undefined,
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }
                    )}
                  </p>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 sm:opacity-0 sm:group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/roadmap/${roadmap.id}`);
                      }}
                    >
                      Open
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(roadmap);
                      }}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Delete Roadmap Dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirmText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{deleteTarget?.title}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the entire roadmap and all nodes
              within it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label>
              Type <span className="font-semibold">{deleteTarget?.title}</span>{" "}
              to confirm
            </Label>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={deleteTarget?.title}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteConfirmText !== deleteTarget?.title}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Roadmap
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      className="mr-1.5 h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function MoreIcon() {
  return (
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
        d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm0 5.25a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm0 5.25a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"
      />
    </svg>
  );
}
