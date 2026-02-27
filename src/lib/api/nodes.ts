import { createClient } from "@/lib/supabase/client";
import type { Node, NodeUpdate, NodeSnapshot, TrashEntry } from "@/types/database";
import { v4 as uuidv4 } from "uuid";

function getSupabase() {
  return createClient();
}

function throwIfError(error: { message: string; code?: string; details?: string; hint?: string } | null) {
  if (error) {
    throw new Error(`${error.message}${error.hint ? ` (${error.hint})` : ""}${error.code ? ` [${error.code}]` : ""}`);
  }
}

export async function fetchNodes(roadmapId: string): Promise<Node[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("nodes")
    .select("*")
    .eq("roadmap_id", roadmapId)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  throwIfError(error);
  return data ?? [];
}

export async function createNode(
  roadmapId: string,
  parentId: string,
  parentPath: string,
  siblingCount: number
): Promise<Node> {
  const supabase = getSupabase();
  const nodeId = uuidv4();
  const path = `${parentPath}/${nodeId}`;

  const { data, error } = await supabase
    .from("nodes")
    .insert({
      id: nodeId,
      roadmap_id: roadmapId,
      parent_id: parentId,
      path,
      position: siblingCount,
      title: "Untitled",
    })
    .select()
    .single();

  throwIfError(error);
  return data;
}

export async function updateNode(
  nodeId: string,
  updates: NodeUpdate
): Promise<Node> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("nodes")
    .update(updates)
    .eq("id", nodeId)
    .select()
    .single();

  throwIfError(error);
  return data;
}

function buildSnapshot(node: Node, allNodes: Node[]): NodeSnapshot {
  const children = allNodes
    .filter((n) => n.parent_id === node.id)
    .sort((a, b) => a.position - b.position)
    .map((child) => buildSnapshot(child, allNodes));

  const { deleted_at: _, ...nodeWithoutDeleted } = node;
  return { node: nodeWithoutDeleted, children };
}

export function countDescendants(
  nodeId: string,
  nodeMap: Map<string, Node>
): number {
  let count = 0;
  for (const node of nodeMap.values()) {
    if (node.path.includes(`/${nodeId}/`) && node.id !== nodeId) {
      count++;
    }
  }
  return count;
}

export async function deleteNodeWithSubtree(
  nodeId: string,
  roadmapId: string,
  allNodes: Node[]
): Promise<void> {
  const supabase = getSupabase();
  const targetNode = allNodes.find((n) => n.id === nodeId);
  if (!targetNode) throw new Error("Node not found");

  const descendants = allNodes.filter(
    (n) => n.path.startsWith(targetNode.path + "/") || n.id === nodeId
  );
  const descendantIds = descendants.map((n) => n.id);

  const snapshot = buildSnapshot(targetNode, allNodes);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const { error: trashError } = await supabase.from("trash_entries").insert({
    id: uuidv4(),
    roadmap_id: roadmapId,
    node_snapshot: snapshot,
    parent_id: targetNode.parent_id,
    original_node_id: nodeId,
    deleted_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  throwIfError(trashError);

  const { error } = await supabase
    .from("nodes")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", descendantIds);

  throwIfError(error);
}

export async function fetchTrashEntries(
  roadmapId: string
): Promise<TrashEntry[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("trash_entries")
    .select("*")
    .eq("roadmap_id", roadmapId)
    .order("deleted_at", { ascending: false });

  throwIfError(error);
  return data ?? [];
}

async function restoreSnapshotRecursive(
  snapshot: NodeSnapshot,
  roadmapId: string
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("nodes").upsert({
    ...snapshot.node,
    roadmap_id: roadmapId,
    deleted_at: null,
  });

  throwIfError(error);

  for (const child of snapshot.children) {
    await restoreSnapshotRecursive(child, roadmapId);
  }
}

export async function restoreFromTrash(
  trashEntryId: string,
  roadmapId: string
): Promise<void> {
  const supabase = getSupabase();
  const { data: entry, error: fetchError } = await supabase
    .from("trash_entries")
    .select("*")
    .eq("id", trashEntryId)
    .single();

  throwIfError(fetchError);

  if (entry.parent_id) {
    const { data: parent } = await supabase
      .from("nodes")
      .select("id")
      .eq("id", entry.parent_id)
      .is("deleted_at", null)
      .single();

    if (!parent) {
      const { data: roadmap } = await supabase
        .from("roadmaps")
        .select("root_node_id")
        .eq("id", roadmapId)
        .single();

      if (roadmap?.root_node_id) {
        entry.node_snapshot.node.parent_id = roadmap.root_node_id;
      }
    }
  }

  await restoreSnapshotRecursive(
    entry.node_snapshot as NodeSnapshot,
    roadmapId
  );

  const { error: deleteError } = await supabase
    .from("trash_entries")
    .delete()
    .eq("id", trashEntryId);

  throwIfError(deleteError);
}

export async function permanentlyDeleteTrashEntry(
  trashEntryId: string
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("trash_entries")
    .delete()
    .eq("id", trashEntryId);

  throwIfError(error);
}
