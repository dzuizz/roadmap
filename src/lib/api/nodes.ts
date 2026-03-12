import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  collection,
  query,
  orderBy,
  where,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import type { Node, NodeUpdate, NodeSnapshot, TrashEntry } from "@/types/database";
import { v4 as uuidv4 } from "uuid";

function toISOString(ts: Timestamp | string): string {
  if (typeof ts === "string") return ts;
  return ts.toDate().toISOString();
}

function docToNode(id: string, data: Record<string, unknown>, roadmapId: string): Node {
  return {
    id,
    roadmapId,
    parentId: (data.parentId as string) ?? null,
    path: data.path as string,
    position: data.position as number,
    title: data.title as string,
    description: (data.description as string) ?? null,
    link: (data.link as string) ?? null,
    isCompleted: (data.isCompleted as boolean) ?? false,
    createdAt: toISOString(data.createdAt as Timestamp),
    updatedAt: toISOString(data.updatedAt as Timestamp),
  };
}

export async function fetchNodes(roadmapId: string): Promise<Node[]> {
  const db = getFirestoreDb();
  const q = query(
    collection(db, "roadmaps", roadmapId, "nodes"),
    orderBy("position", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => docToNode(d.id, d.data(), roadmapId));
}

export async function createNode(
  roadmapId: string,
  parentId: string,
  parentPath: string,
  siblingCount: number
): Promise<Node> {
  const db = getFirestoreDb();
  const nodeId = uuidv4();
  const path = `${parentPath}/${nodeId}`;
  const now = serverTimestamp();

  const nodeData = {
    parentId,
    path,
    position: siblingCount,
    title: "Untitled",
    description: null,
    link: null,
    isCompleted: false,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, "roadmaps", roadmapId, "nodes", nodeId), nodeData);

  const nowISO = new Date().toISOString();
  return {
    id: nodeId,
    roadmapId,
    parentId,
    path,
    position: siblingCount,
    title: "Untitled",
    description: null,
    link: null,
    isCompleted: false,
    createdAt: nowISO,
    updatedAt: nowISO,
  };
}

export async function updateNode(
  nodeId: string,
  updates: NodeUpdate,
  roadmapId?: string
): Promise<Node> {
  const db = getFirestoreDb();

  if (!roadmapId) {
    throw new Error("roadmapId is required for updateNode");
  }

  const nodeRef = doc(db, "roadmaps", roadmapId, "nodes", nodeId);
  await updateDoc(nodeRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });

  const snap = await getDoc(nodeRef);
  return docToNode(snap.id, snap.data()!, roadmapId);
}

function buildSnapshot(node: Node, allNodes: Node[]): NodeSnapshot {
  const children = allNodes
    .filter((n) => n.parentId === node.id)
    .sort((a, b) => a.position - b.position)
    .map((child) => buildSnapshot(child, allNodes));

  return { node, children };
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
  const db = getFirestoreDb();
  const targetNode = allNodes.find((n) => n.id === nodeId);
  if (!targetNode) throw new Error("Node not found");

  const descendants = allNodes.filter(
    (n) => n.path.startsWith(targetNode.path + "/") || n.id === nodeId
  );

  // Create trash snapshot
  const snapshot = buildSnapshot(targetNode, allNodes);
  const trashId = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 30);

  const batch = writeBatch(db);

  // Add trash entry
  batch.set(doc(db, "roadmaps", roadmapId, "trash", trashId), {
    nodeSnapshot: JSON.parse(JSON.stringify(snapshot)),
    parentId: targetNode.parentId,
    originalNodeId: nodeId,
    deletedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  // Delete all descendant nodes (hard delete)
  for (const node of descendants) {
    batch.delete(doc(db, "roadmaps", roadmapId, "nodes", node.id));
  }

  await batch.commit();
}

export async function fetchTrashEntries(
  roadmapId: string
): Promise<TrashEntry[]> {
  const db = getFirestoreDb();
  const q = query(
    collection(db, "roadmaps", roadmapId, "trash"),
    orderBy("deletedAt", "desc")
  );
  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      roadmapId,
      nodeSnapshot: data.nodeSnapshot as NodeSnapshot,
      parentId: (data.parentId as string) ?? null,
      originalNodeId: data.originalNodeId as string,
      deletedAt: data.deletedAt as string,
      expiresAt: data.expiresAt as string,
    };
  });
}

async function restoreSnapshotRecursive(
  snapshot: NodeSnapshot,
  roadmapId: string,
  batch: ReturnType<typeof writeBatch>
): Promise<void> {
  const { id, roadmapId: _, ...nodeFields } = snapshot.node;
  batch.set(doc(getFirestoreDb(), "roadmaps", roadmapId, "nodes", id), {
    ...nodeFields,
    updatedAt: serverTimestamp(),
  });

  for (const child of snapshot.children) {
    restoreSnapshotRecursive(child, roadmapId, batch);
  }
}

export async function restoreFromTrash(
  trashEntryId: string,
  roadmapId: string
): Promise<void> {
  const db = getFirestoreDb();
  const trashRef = doc(db, "roadmaps", roadmapId, "trash", trashEntryId);
  const trashSnap = await getDoc(trashRef);

  if (!trashSnap.exists()) throw new Error("Trash entry not found");

  const data = trashSnap.data();
  const snapshot = data.nodeSnapshot as NodeSnapshot;

  // Check if original parent still exists
  if (snapshot.node.parentId) {
    const parentSnap = await getDoc(
      doc(db, "roadmaps", roadmapId, "nodes", snapshot.node.parentId)
    );
    if (!parentSnap.exists()) {
      const roadmapSnap = await getDoc(doc(db, "roadmaps", roadmapId));
      const rootNodeId = roadmapSnap.data()?.rootNodeId;
      if (rootNodeId) {
        snapshot.node.parentId = rootNodeId;
      }
    }
  }

  const batch = writeBatch(db);
  await restoreSnapshotRecursive(snapshot, roadmapId, batch);
  batch.delete(trashRef);
  await batch.commit();
}

export async function permanentlyDeleteTrashEntry(
  trashEntryId: string,
  roadmapId?: string
): Promise<void> {
  if (!roadmapId) throw new Error("roadmapId is required");
  const db = getFirestoreDb();
  await deleteDoc(doc(db, "roadmaps", roadmapId, "trash", trashEntryId));
}
