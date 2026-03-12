"use client";

import { useState, useEffect } from "react";
import { getOpenAIApiKey, saveOpenAIApiKey } from "@/lib/api/settings";
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
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSaved(false);
      setError(null);
      getOpenAIApiKey()
        .then((key) => {
          if (key) setApiKey(key);
        })
        .catch(() => {});
    } else {
      setApiKey("");
    }
  }, [open]);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      await saveOpenAIApiKey(apiKey.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError("Failed to save API key. Please try again.");
      console.error("Failed to save API key:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="api-key">OpenAI API Key</Label>
            <Input
              id="api-key"
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Required for AI roadmap generation. Your key is stored in your
              account and only accessible by you.
            </p>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            {saved && (
              <span className="text-xs text-green-600 dark:text-green-400">
                Saved
              </span>
            )}
            <Button onClick={handleSave} disabled={loading || !apiKey.trim()}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
