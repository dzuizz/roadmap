"use client";

import { useEffect } from "react";
import { useRoadmapStore } from "@/stores/roadmap-store";

export function useKeyboardShortcuts(roadmapId: string, rootNodeId: string | null, onOpenTrash: () => void, onOpenHelp: () => void) {
  useEffect(() => {
    function isEditing() {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || (el as HTMLElement).isContentEditable;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (isEditing()) return;

      const store = useRoadmapStore.getState();
      const { selectedNodeId, nodes, getChildren } = store;

      switch (e.key) {
        // Toggle completion on selected node (leaf only)
        case " ": {
          e.preventDefault();
          if (!selectedNodeId) return;
          const node = nodes.get(selectedNodeId);
          if (!node) return;
          const children = getChildren(selectedNodeId);
          if (children.length === 0) {
            store.updateNode(selectedNodeId, { is_completed: !node.is_completed });
          }
          break;
        }

        // Add child to selected node
        case "c": {
          if (!selectedNodeId) return;
          store.addNode(roadmapId, selectedNodeId);
          break;
        }

        // Delete selected node
        case "Delete":
        case "Backspace": {
          if (!selectedNodeId || selectedNodeId === rootNodeId) return;
          // The actual delete will be handled by the delete dialog in node-detail.
          // We dispatch a custom event that the page component listens for.
          window.dispatchEvent(new CustomEvent("roadmap:request-delete"));
          break;
        }

        // Expand / collapse
        case "ArrowRight": {
          if (!selectedNodeId) return;
          const children = getChildren(selectedNodeId);
          if (children.length > 0 && !store.expandedNodes.has(selectedNodeId)) {
            store.toggleExpand(selectedNodeId);
          } else if (children.length > 0 && store.expandedNodes.has(selectedNodeId)) {
            // Select first child
            store.selectNode(children[0].id);
          }
          break;
        }

        case "ArrowLeft": {
          if (!selectedNodeId) return;
          if (store.expandedNodes.has(selectedNodeId) && getChildren(selectedNodeId).length > 0) {
            store.toggleExpand(selectedNodeId);
          } else {
            // Select parent
            const node = nodes.get(selectedNodeId);
            if (node?.parent_id) {
              store.selectNode(node.parent_id);
            }
          }
          break;
        }

        case "ArrowDown": {
          e.preventDefault();
          if (!selectedNodeId) return;
          const next = getNextVisibleNode(selectedNodeId, store);
          if (next) store.selectNode(next);
          break;
        }

        case "ArrowUp": {
          e.preventDefault();
          if (!selectedNodeId) return;
          const prev = getPreviousVisibleNode(selectedNodeId, store);
          if (prev) store.selectNode(prev);
          break;
        }

        // Escape to deselect
        case "Escape": {
          store.selectNode(null);
          break;
        }

        // Focus mode: Enter to zoom into selected, Backspace on root to zoom out
        case "Enter": {
          if (!selectedNodeId) return;
          const children = getChildren(selectedNodeId);
          if (children.length > 0) {
            store.setFocus(selectedNodeId);
          }
          break;
        }

        // Show shortcuts help
        case "?": {
          onOpenHelp();
          break;
        }

        // Open trash
        case "t": {
          onOpenTrash();
          break;
        }

        default:
          return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [roadmapId, rootNodeId, onOpenTrash, onOpenHelp]);
}

// Navigation helpers — walk the visible tree in document order

function getVisibleNodes(store: ReturnType<typeof useRoadmapStore.getState>): string[] {
  const result: string[] = [];
  const { nodes, expandedNodes, getChildren, focusedNodeId } = store;

  // Find root
  let rootId: string | null = focusedNodeId;
  if (!rootId) {
    for (const node of nodes.values()) {
      if (!node.parent_id) {
        rootId = node.id;
        break;
      }
    }
  }
  if (!rootId) return result;

  function walk(nodeId: string) {
    result.push(nodeId);
    if (expandedNodes.has(nodeId)) {
      const children = getChildren(nodeId);
      for (const child of children) {
        walk(child.id);
      }
    }
  }

  walk(rootId);
  return result;
}

function getNextVisibleNode(currentId: string, store: ReturnType<typeof useRoadmapStore.getState>): string | null {
  const visible = getVisibleNodes(store);
  const idx = visible.indexOf(currentId);
  return idx >= 0 && idx < visible.length - 1 ? visible[idx + 1] : null;
}

function getPreviousVisibleNode(currentId: string, store: ReturnType<typeof useRoadmapStore.getState>): string | null {
  const visible = getVisibleNodes(store);
  const idx = visible.indexOf(currentId);
  return idx > 0 ? visible[idx - 1] : null;
}
