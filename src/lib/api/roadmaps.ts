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
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { getFirestoreDb, getFirebaseAuth } from "@/lib/firebase/client";
import type { Roadmap, UserRoadmapEntry } from "@/types/database";
import { v4 as uuidv4 } from "uuid";

function toISOString(ts: Timestamp | string): string {
  if (typeof ts === "string") return ts;
  return ts.toDate().toISOString();
}

export async function fetchRoadmaps(): Promise<(Roadmap & { role: string })[]> {
  const db = getFirestoreDb();
  const auth = getFirebaseAuth();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error("Not authenticated");

  const q = query(
    collection(db, "userRoadmaps", userId, "roadmaps"),
    orderBy("updatedAt", "desc")
  );
  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const data = d.data() as UserRoadmapEntry & {
      description?: string | null;
      ownerId?: string;
      rootNodeId?: string | null;
      createdAt?: Timestamp | string;
    };
    return {
      id: d.id,
      ownerId: data.ownerId ?? userId,
      title: data.title,
      description: data.description ?? null,
      rootNodeId: data.rootNodeId ?? null,
      createdAt: data.createdAt ? toISOString(data.createdAt as Timestamp) : "",
      updatedAt: toISOString(data.updatedAt as unknown as Timestamp),
      role: data.role,
    };
  });
}

export async function fetchRoadmap(id: string): Promise<Roadmap | null> {
  const db = getFirestoreDb();
  const snap = await getDoc(doc(db, "roadmaps", id));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    ownerId: data.ownerId,
    title: data.title,
    description: data.description ?? null,
    rootNodeId: data.rootNodeId ?? null,
    createdAt: toISOString(data.createdAt),
    updatedAt: toISOString(data.updatedAt),
  };
}

export async function createRoadmap(
  title: string,
  description?: string
): Promise<Roadmap> {
  const db = getFirestoreDb();
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const roadmapId = uuidv4();
  const rootNodeId = uuidv4();
  const now = serverTimestamp();

  const batch = writeBatch(db);

  // 1. Roadmap document
  batch.set(doc(db, "roadmaps", roadmapId), {
    ownerId: user.uid,
    title,
    description: description || null,
    rootNodeId,
    createdAt: now,
    updatedAt: now,
  });

  // 2. Root node
  batch.set(doc(db, "roadmaps", roadmapId, "nodes", rootNodeId), {
    parentId: null,
    path: `/${rootNodeId}`,
    position: 0,
    title,
    description: description || null,
    link: null,
    isCompleted: false,
    createdAt: now,
    updatedAt: now,
  });

  // 3. Owner membership
  batch.set(doc(db, "roadmaps", roadmapId, "members", user.uid), {
    role: "owner",
    addedAt: now,
  });

  // 4. User roadmap index (denormalized for dashboard)
  batch.set(doc(db, "userRoadmaps", user.uid, "roadmaps", roadmapId), {
    role: "owner",
    title,
    description: description || null,
    ownerId: user.uid,
    rootNodeId,
    createdAt: now,
    updatedAt: now,
  });

  await batch.commit();

  const nowISO = new Date().toISOString();
  return {
    id: roadmapId,
    ownerId: user.uid,
    title,
    description: description || null,
    rootNodeId,
    createdAt: nowISO,
    updatedAt: nowISO,
  };
}

export async function updateRoadmap(
  id: string,
  updates: Partial<Pick<Roadmap, "title" | "description">>
): Promise<Roadmap> {
  const db = getFirestoreDb();
  const roadmapRef = doc(db, "roadmaps", id);

  await updateDoc(roadmapRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });

  // Update denormalized fields in userRoadmaps for all members
  if (updates.title || updates.description !== undefined) {
    const membersSnap = await getDocs(
      collection(db, "roadmaps", id, "members")
    );
    const denormalized: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.title) denormalized.title = updates.title;
    if (updates.description !== undefined) denormalized.description = updates.description;
    const batch = writeBatch(db);
    for (const memberDoc of membersSnap.docs) {
      batch.update(
        doc(db, "userRoadmaps", memberDoc.id, "roadmaps", id),
        denormalized
      );
    }
    await batch.commit();
  }

  const snap = await getDoc(roadmapRef);
  const data = snap.data()!;
  return {
    id,
    ownerId: data.ownerId,
    title: data.title,
    description: data.description ?? null,
    rootNodeId: data.rootNodeId ?? null,
    createdAt: toISOString(data.createdAt),
    updatedAt: toISOString(data.updatedAt),
  };
}

export async function deleteRoadmap(id: string): Promise<void> {
  const db = getFirestoreDb();

  // Delete subcollections: nodes and trash first, members last.
  // Members must be deleted last because security rules for nodes/trash
  // check membership via the members subcollection.
  const subcollections = ["nodes", "trash", "members"];
  for (const sub of subcollections) {
    const snap = await getDocs(collection(db, "roadmaps", id, sub));
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const chunk = docs.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const d of chunk) {
        batch.delete(d.ref);
        if (sub === "members") {
          batch.delete(doc(db, "userRoadmaps", d.id, "roadmaps", id));
        }
      }
      await batch.commit();
    }
  }

  // Delete the roadmap document
  await deleteDoc(doc(db, "roadmaps", id));
}
