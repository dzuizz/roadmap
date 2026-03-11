import { create } from "zustand";
import type { Node, TrashEntry } from "@/types/database";
import * as nodesApi from "@/lib/api/nodes";
import * as roadmapsApi from "@/lib/api/roadmaps";

type ViewMode = "list" | "cards";

interface Progress {
  completed: number;
  total: number;
}

interface RoadmapEditorState {
  nodes: Map<string, Node>;
  // Pre-built children index: parentId -> sorted child ids
  childrenIndex: Map<string, string[]>;
  selectedNodeId: string | null;
  expandedNodes: Set<string>;
  focusedNodeId: string | null;
  viewMode: ViewMode;
  trashEntries: TrashEntry[];
  loading: boolean;
  saving: boolean;
  // Track the current roadmap id + root node id for title sync
  currentRoadmapId: string | null;
  currentRootNodeId: string | null;

  loadNodes: (roadmapId: string, rootNodeId?: string) => Promise<void>;
  addNode: (roadmapId: string, parentId: string) => Promise<void>;
  updateNode: (nodeId: string, updates: Partial<Pick<Node, "title" | "description" | "link" | "isCompleted">>) => Promise<void>;
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

/** Build a parentId -> sorted child id[] index from a node map */
function buildChildrenIndex(nodes: Map<string, Node>): Map<string, string[]> {
  const index = new Map<string, string[]>();
  // Group by parent
  for (const node of nodes.values()) {
    if (node.parentId) {
      let siblings = index.get(node.parentId);
      if (!siblings) {
        siblings = [];
        index.set(node.parentId, siblings);
      }
      siblings.push(node.id);
    }
  }
  // Sort each group by position
  for (const [, children] of index) {
    children.sort((a, b) => {
      const na = nodes.get(a)!;
      const nb = nodes.get(b)!;
      return na.position - nb.position;
    });
  }
  return index;
}

export const useRoadmapStore = create<RoadmapEditorState>((set, get) => ({
  nodes: new Map(),
  childrenIndex: new Map(),
  selectedNodeId: null,
  expandedNodes: new Set(),
  focusedNodeId: null,
  viewMode: (typeof window !== "undefined" ? localStorage.getItem("viewMode") as ViewMode : null) || "list",
  trashEntries: [],
  loading: false,
  saving: false,
  currentRoadmapId: null,
  currentRootNodeId: null,

  loadNodes: async (roadmapId, rootNodeId) => {
    set({ loading: true });
    try {
      const nodes = await nodesApi.fetchNodes(roadmapId);
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      const childrenIndex = buildChildrenIndex(nodeMap);

      // Expand root and first-level children by default
      const expanded = new Set<string>();
      for (const node of nodes) {
        if (!node.parentId) {
          expanded.add(node.id);
          // Expand first-level children
          const kids = childrenIndex.get(node.id);
          if (kids) {
            for (const kid of kids) expanded.add(kid);
          }
        }
      }
      set({
        nodes: nodeMap,
        childrenIndex,
        expandedNodes: expanded,
        loading: false,
        currentRoadmapId: roadmapId,
        currentRootNodeId: rootNodeId ?? null,
      });
    } catch (error) {
      console.error("Failed to load nodes:", error);
      set({ loading: false });
    }
  },

  addNode: async (roadmapId, parentId) => {
    const { nodes, childrenIndex } = get();
    const parent = nodes.get(parentId);
    if (!parent) return;

    const siblingCount = (childrenIndex.get(parentId) ?? []).length;

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
        const newIndex = new Map(state.childrenIndex);
        const siblings = [...(newIndex.get(parentId) ?? []), newNode.id];
        newIndex.set(parentId, siblings);
        const newExpanded = new Set(state.expandedNodes);
        newExpanded.add(parentId);
        return {
          nodes: newNodes,
          childrenIndex: newIndex,
          expandedNodes: newExpanded,
          selectedNodeId: newNode.id,
        };
      });
    } catch (error) {
      console.error("Failed to add node:", error);
    }
  },

  updateNode: async (nodeId, updates) => {
    const { currentRoadmapId, currentRootNodeId } = get();

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
      const updated = await nodesApi.updateNode(nodeId, updates, currentRoadmapId!);
      set((state) => {
        const newNodes = new Map(state.nodes);
        newNodes.set(nodeId, updated);
        return { nodes: newNodes, saving: false };
      });

      // Sync root node title → roadmap title
      if (
        updates.title &&
        nodeId === currentRootNodeId &&
        currentRoadmapId
      ) {
        roadmapsApi.updateRoadmap(currentRoadmapId, { title: updates.title });
      }
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

      set((state) => {
        const newNodes = new Map(state.nodes);
        const toRemoveIds = new Set<string>();
        for (const n of newNodes.values()) {
          if (n.id === nodeId || n.path.startsWith(targetNode.path + "/")) {
            toRemoveIds.add(n.id);
          }
        }
        for (const id of toRemoveIds) {
          newNodes.delete(id);
        }
        const newIndex = buildChildrenIndex(newNodes);
        return {
          nodes: newNodes,
          childrenIndex: newIndex,
          selectedNodeId:
            state.selectedNodeId && toRemoveIds.has(state.selectedNodeId)
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
    const { nodes, childrenIndex } = get();
    const ids = childrenIndex.get(parentId);
    if (!ids) return [];
    const result: Node[] = [];
    for (const id of ids) {
      const node = nodes.get(id);
      if (node) result.push(node);
    }
    return result;
  },

  getDescendantCount: (nodeId) => {
    const { nodes } = get();
    const target = nodes.get(nodeId);
    if (!target) return 0;
    const prefix = target.path + "/";
    let count = 0;
    for (const node of nodes.values()) {
      if (node.path.startsWith(prefix)) count++;
    }
    return count;
  },

  getProgress: (nodeId) => {
    const state = get();
    const childIds = state.childrenIndex.get(nodeId);
    if (!childIds || childIds.length === 0) {
      const node = state.nodes.get(nodeId);
      return { completed: node?.isCompleted ? 1 : 0, total: 1 };
    }
    let completed = 0;
    for (const cid of childIds) {
      const child = state.nodes.get(cid);
      if (!child) continue;
      const grandchildIds = state.childrenIndex.get(cid);
      if (!grandchildIds || grandchildIds.length === 0) {
        if (child.isCompleted) completed++;
      } else {
        const childProgress = state.getProgress(cid);
        if (childProgress.completed === childProgress.total) completed++;
      }
    }
    return { completed, total: childIds.length };
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
      await get().loadNodes(roadmapId, get().currentRootNodeId ?? undefined);
      await get().loadTrash(roadmapId);
    } catch (error) {
      console.error("Failed to restore:", error);
    }
  },

  deleteTrashEntry: async (entryId) => {
    const { currentRoadmapId } = get();
    try {
      await nodesApi.permanentlyDeleteTrashEntry(entryId, currentRoadmapId!);
      set((state) => ({
        trashEntries: state.trashEntries.filter((e) => e.id !== entryId),
      }));
    } catch (error) {
      console.error("Failed to delete trash entry:", error);
    }
  },
}));
