"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const shortcuts = [
  { keys: ["↑", "↓"], description: "Navigate between nodes" },
  { keys: ["←"], description: "Collapse node / select parent" },
  { keys: ["→"], description: "Expand node / select first child" },
  { keys: ["Space"], description: "Toggle completion (leaf nodes)" },
  { keys: ["C"], description: "Create child node" },
  { keys: ["Enter"], description: "Focus into subtree" },
  { keys: ["Delete"], description: "Delete selected node" },
  { keys: ["Esc"], description: "Deselect / close panel" },
  { keys: ["T"], description: "Open trash" },
  { keys: ["?"], description: "Show this help" },
];

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 pt-2">
          {shortcuts.map((s) => (
            <div
              key={s.description}
              className="flex items-center justify-between py-1.5"
            >
              <span className="text-sm text-muted-foreground">
                {s.description}
              </span>
              <div className="flex items-center gap-1">
                {s.keys.map((key) => (
                  <kbd
                    key={key}
                    className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border bg-muted px-1.5 text-xs font-mono"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
