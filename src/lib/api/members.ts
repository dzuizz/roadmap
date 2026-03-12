import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import {
  getFirestoreDb,
  getFirebaseAuth,
} from "@/lib/firebase/client";
import type { Member, MemberRole } from "@/types/database";

export async function fetchMembers(roadmapId: string): Promise<Member[]> {
  const db = getFirestoreDb();
  const snap = await getDocs(collection(db, "roadmaps", roadmapId, "members"));

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      userId: d.id,
      role: data.role as MemberRole,
      addedAt: data.addedAt?.toDate?.().toISOString() ?? new Date().toISOString(),
      email: data.email,
      displayName: data.displayName,
    };
  });
}

// Note: Firebase Auth does not support client-side user lookup by email.
// The share dialog should call a Cloud Function or use a /users collection
// (populated on sign-up) to resolve email → userId before calling addMember.

export async function addMember(
  roadmapId: string,
  userId: string,
  role: MemberRole,
  roadmapTitle: string,
  email?: string,
  displayName?: string
): Promise<void> {
  const db = getFirestoreDb();
  const batch = writeBatch(db);

  // Add to members subcollection
  batch.set(doc(db, "roadmaps", roadmapId, "members", userId), {
    role,
    addedAt: serverTimestamp(),
    ...(email && { email }),
    ...(displayName && { displayName }),
  });

  // Add to user's roadmap index (denormalized for dashboard)
  const roadmapSnap = await getDoc(doc(db, "roadmaps", roadmapId));
  const roadmapData = roadmapSnap.data();
  batch.set(doc(db, "userRoadmaps", userId, "roadmaps", roadmapId), {
    role,
    title: roadmapTitle,
    description: roadmapData?.description ?? null,
    ownerId: roadmapData?.ownerId ?? null,
    rootNodeId: roadmapData?.rootNodeId ?? null,
    createdAt: roadmapData?.createdAt ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

export async function removeMember(
  roadmapId: string,
  userId: string
): Promise<void> {
  const db = getFirestoreDb();
  const batch = writeBatch(db);

  batch.delete(doc(db, "roadmaps", roadmapId, "members", userId));
  batch.delete(doc(db, "userRoadmaps", userId, "roadmaps", roadmapId));

  await batch.commit();
}

export async function updateMemberRole(
  roadmapId: string,
  userId: string,
  role: MemberRole
): Promise<void> {
  const db = getFirestoreDb();
  const batch = writeBatch(db);

  batch.update(doc(db, "roadmaps", roadmapId, "members", userId), { role });
  batch.update(doc(db, "userRoadmaps", userId, "roadmaps", roadmapId), { role });

  await batch.commit();
}
