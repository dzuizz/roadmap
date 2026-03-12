"use client";

import { useState, useEffect } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { getAISettings, type AIProvider } from "@/lib/api/settings";
import * as roadmapsApi from "@/lib/api/roadmaps";
import { createNodesFromTree } from "@/lib/api/nodes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GeneratedNode {
  title: string;
  description: string | null;
  children: GeneratedNode[];
}

interface GenerateRoadmapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (roadmapId: string) => void;
}

export function GenerateRoadmapDialog({
  open,
  onOpenChange,
  onGenerated,
}: GenerateRoadmapDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<AIProvider>("gemini");
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);

  useEffect(() => {
    if (open) {
      setError(null);
      setPrompt("");
      getAISettings()
        .then((settings) => {
          setHasOpenAIKey(!!settings.openaiApiKey);
          setHasGeminiKey(!!settings.geminiApiKey);
          setProvider(settings.preferredProvider);
        })
        .catch(() => {
          setHasOpenAIKey(false);
          setHasGeminiKey(false);
        });
    }
  }, [open]);

  const hasKeyForProvider = provider === "openai" ? hasOpenAIKey : hasGeminiKey;
  const hasAnyKey = hasOpenAIKey || hasGeminiKey;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);

    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/generate-roadmap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: prompt.trim(), provider }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate roadmap");
        return;
      }

      const tree = data.tree as GeneratedNode;

      const roadmap = await roadmapsApi.createRoadmap(
        tree.title,
        tree.description || undefined
      );

      if (tree.children.length > 0 && roadmap.rootNodeId) {
        await createNodesFromTree(
          roadmap.id,
          roadmap.rootNodeId,
          tree.children
        );
      }

      onGenerated(roadmap.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Roadmap with AI</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {!hasAnyKey && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
              No API key configured. Add one in Settings (gear icon) to use
              this feature.
            </div>
          )}
          <div className="space-y-2">
            <Label>AI Provider</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={provider === "gemini" ? "default" : "outline"}
                onClick={() => setProvider("gemini")}
                disabled={generating}
              >
                Gemini
              </Button>
              <Button
                type="button"
                size="sm"
                variant={provider === "openai" ? "default" : "outline"}
                onClick={() => setProvider("openai")}
                disabled={generating}
              >
                OpenAI
              </Button>
            </div>
            {!hasKeyForProvider && hasAnyKey && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                No {provider === "openai" ? "OpenAI" : "Gemini"} API key set.
                Add one in Settings or switch provider.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="prompt">What do you want to learn?</Label>
            <Textarea
              id="prompt"
              placeholder="e.g., Full-stack web development with React and Node.js"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              disabled={generating}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={generating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim() || !hasKeyForProvider}
            >
              {generating ? "Generating..." : "Generate"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
