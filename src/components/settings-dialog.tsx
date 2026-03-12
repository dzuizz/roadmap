"use client";

import { useState, useEffect } from "react";
import { getAISettings, saveAISettings, type AIProvider } from "@/lib/api/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [preferredProvider, setPreferredProvider] = useState<AIProvider>("gemini");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSaved(false);
      setError(null);
      getAISettings()
        .then((settings) => {
          if (settings.openaiApiKey) setOpenaiKey(settings.openaiApiKey);
          if (settings.geminiApiKey) setGeminiKey(settings.geminiApiKey);
          setPreferredProvider(settings.preferredProvider);
        })
        .catch(() => {});
    } else {
      setOpenaiKey("");
      setGeminiKey("");
    }
  }, [open]);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      await saveAISettings({
        ...(openaiKey.trim() && { openaiApiKey: openaiKey.trim() }),
        ...(geminiKey.trim() && { geminiApiKey: geminiKey.trim() }),
        preferredProvider,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError("Failed to save settings. Please try again.");
      console.error("Failed to save settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const hasAnyKey = openaiKey.trim() || geminiKey.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Preferred AI Provider</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={preferredProvider === "gemini" ? "default" : "outline"}
                onClick={() => setPreferredProvider("gemini")}
              >
                Gemini
              </Button>
              <Button
                type="button"
                size="sm"
                variant={preferredProvider === "openai" ? "default" : "outline"}
                onClick={() => setPreferredProvider("openai")}
              >
                OpenAI
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gemini-key">Gemini API Key</Label>
            <Input
              id="gemini-key"
              type="password"
              placeholder="AIza..."
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="openai-key">OpenAI API Key</Label>
            <Input
              id="openai-key"
              type="password"
              placeholder="sk-..."
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            At least one API key is required for AI roadmap generation. Your
            keys are stored in your account and only accessible by you.
          </p>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            {saved && (
              <span className="text-xs text-green-600 dark:text-green-400">
                Saved
              </span>
            )}
            <Button onClick={handleSave} disabled={loading || !hasAnyKey}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
