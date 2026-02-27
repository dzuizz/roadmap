import { create } from "zustand";
import type { Node, TrashEntry } from "@/types/database";
import * as nodesApi from "@/lib/api/nodes";

type ViewMode = "list" | "cards";

interface Progress {
  completed: number;
  total: number;
}

interface RoadmapEditorState {
  // Node data as flat map for O(1) lookups
  nodes: Map<string, Node>;
  selectedNodeId: string | null;
  expandedNodes: Set<string>;
  focusedNodeId: string | null;
  viewMode: ViewMode;
  trashEntries: TrashEntry[];
  loading: boolean;
  saving: boolean;

  // Actions
  loadNodes: (roadmapId: string) => Promise<void>;
  addNode: (roadmapId: string, parentId: string) => Promise<void>;
  updateNode: (nodeId: string, updates: Partial<Pick<Node, "title" | "description" | "link" | "is_completed">>) => Promise<void>;
  deleteNode: (nodeId: string, roadmapId: string) => Promise<void>;
  selectNode: (nodeId: string | null) => void;
  toggleExpand: (nodeId: string) => void;
  setFocus: (nodeId: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  getChildren: (parentId: string) => Node[];
  getDescendantCount: (nodeId: string) => number;
  getProgress: (nodeId: string) => Progress;
  loadTrash: (roadmapId: string) => Promise<void>;
  restoreTrashEntry: (entryId: string, roadmapId: string) => Promise<void>;
  deleteTrashEntry: (entryId: string) => Promise<void>;
}

export const useRoadmapStore = create<RoadmapEditorState>((set, get) => ({
  nodes: new Map(),
  selectedNodeId: null,
  expandedNodes: new Set(),
  focusedNodeId: null,
  viewMode: (typeof window !== "undefined" ? localStorage.getItem("viewMode") as ViewMode : null) || "list",
  trashEntries: [],
  loading: false,
  saving: false,

  loadNodes: async (roadmapId) => {
    set({ loading: true });
    try {
      const nodes = await nodesApi.fetchNodes(roadmapId);
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      // Expand root and first-level children by default
      const expanded = new Set<string>();
      for (const node of nodes) {
        if (!node.parent_id || nodes.some((n) => n.parent_id === null && node.parent_id === n.id)) {
          expanded.add(node.id);
        }
      }
      set({ nodes: nodeMap, expandedNodes: expanded, loading: false });
    } catch (error) {
      console.error("Failed to load nodes:", error);
      set({ loading: false });
    }
  },

  addNode: async (roadmapId, parentId) => {
    const { nodes } = get();
    const parent = nodes.get(parentId);
    if (!parent) return;

    const siblingCount = get().getChildren(parentId).length;

    try {
      const newNode = await nodesApi.createNode(
        roadmapId,
        parentId,
        parent.path,
        siblingCount
      );

      set((state) => {
        const newNodes = new Map(state.nodes);
        newNodes.set(newNode.id, newNode);
        const newExpanded = new Set(state.expandedNodes);
        newExpanded.add(parentId);
        return {
          nodes: newNodes,
          expandedNodes: newExpanded,
          selectedNodeId: newNode.id,
        };
      });
    } catch (error) {
      console.error("Failed to add node:", error);
    }
  },

  updateNode: async (nodeId, updates) => {
    // Optimistic update
    set((state) => {
      const newNodes = new Map(state.nodes);
      const existing = newNodes.get(nodeId);
      if (existing) {
        newNodes.set(nodeId, { ...existing, ...updates });
      }
      return { nodes: newNodes };
    });

    set({ saving: true });
    try {
      const updated = await nodesApi.updateNode(nodeId, updates);
      set((state) => {
        const newNodes = new Map(state.nodes);
        newNodes.set(nodeId, updated);
        return { nodes: newNodes, saving: false };
      });
    } catch (error) {
      console.error("Failed to update node:", error);
      set({ saving: false });
    }
  },

  deleteNode: async (nodeId, roadmapId) => {
    const { nodes } = get();
    const allNodes = Array.from(nodes.values());
    const targetNode = nodes.get(nodeId);
    if (!targetNode) return;

    try {
      await nodesApi.deleteNodeWithSubtree(nodeId, roadmapId, allNodes);

      // Remove deleted nodes from local state
      set((state) => {
        const newNodes = new Map(state.nodes);
        const toRemove = Array.from(newNodes.values()).filter(
          (n) =>
            n.id === nodeId ||
            n.path.startsWith(targetNode.path + "/")
        );
        for (const node of toRemove) {
          newNodes.delete(node.id);
        }
        return {
          nodes: newNodes,
          selectedNodeId:
            state.selectedNodeId && toRemove.some((n) => n.id === state.selectedNodeId)
              ? null
              : state.selectedNodeId,
        };
      });
    } catch (error) {
      console.error("Failed to delete node:", error);
    }
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  toggleExpand: (nodeId) =>
    set((state) => {
      const newExpanded = new Set(state.expandedNodes);
      if (newExpanded.has(nodeId)) {
        newExpanded.delete(nodeId);
      } else {
        newExpanded.add(nodeId);
      }
      return { expandedNodes: newExpanded };
    }),

  setFocus: (nodeId) => set({ focusedNodeId: nodeId }),

  setViewMode: (mode) => {
    set({ viewMode: mode });
    if (typeof window !== "undefined") {
      localStorage.setItem("viewMode", mode);
    }
  },

  getChildren: (parentId) => {
    const { nodes } = get();
    return Array.from(nodes.values())
      .filter((n) => n.parent_id === parentId)
      .sort((a, b) => a.position - b.position);
  },

  getDescendantCount: (nodeId) => {
    const { nodes } = get();
    const target = nodes.get(nodeId);
    if (!target) return 0;
    let count = 0;
    for (const node of nodes.values()) {
      if (node.id !== nodeId && node.path.startsWith(target.path + "/")) {
        count++;
      }
    }
    return count;
  },

  getProgress: (nodeId) => {
    const children = get().getChildren(nodeId);
    if (children.length === 0) {
      const node = get().nodes.get(nodeId);
      return { completed: node?.is_completed ? 1 : 0, total: 1 };
    }
    const completed = children.filter((c) => {
      const childChildren = get().getChildren(c.id);
      if (childChildren.length === 0) return c.is_completed;
      const childProgress = get().getProgress(c.id);
      return childProgress.completed === childProgress.total;
    }).length;
    return { completed, total: children.length };
  },

  loadTrash: async (roadmapId) => {
    try {
      const entries = await nodesApi.fetchTrashEntries(roadmapId);
      set({ trashEntries: entries });
    } catch (error) {
      console.error("Failed to load trash:", error);
    }
  },

  restoreTrashEntry: async (entryId, roadmapId) => {
    try {
      await nodesApi.restoreFromTrash(entryId, roadmapId);
      // Reload nodes and trash
      await get().loadNodes(roadmapId);
      await get().loadTrash(roadmapId);
    } catch (error) {
      console.error("Failed to restore:", error);
    }
  },

  deleteTrashEntry: async (entryId) => {
    try {
      await nodesApi.permanentlyDeleteTrashEntry(entryId);
      set((state) => ({
        trashEntries: state.trashEntries.filter((e) => e.id !== entryId),
      }));
    } catch (error) {
      console.error("Failed to delete trash entry:", error);
    }
  },
}));
