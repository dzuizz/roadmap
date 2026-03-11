# Supabase to Firebase Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase with Firebase (Firestore + Auth) and add role-based collaboration (owner/editor/viewer) per roadmap.

**Architecture:** Subcollection-based Firestore model where each roadmap contains `/members`, `/nodes`, and `/trash` subcollections. A denormalized `/userRoadmaps/{userId}/roadmaps` collection powers the dashboard. Firebase Auth replaces Supabase Auth with popup-based OAuth. All queries are client-side.

**Tech Stack:** Firebase 11+, Firestore, Firebase Auth, Next.js 16, Zustand, TypeScript

---

## File Structure

### New Files
- `src/lib/firebase/config.ts` — Firebase config from env vars
- `src/lib/firebase/client.ts` — Firebase app, Firestore, Auth singletons (lazy init)
- `src/lib/api/members.ts` — Member CRUD (add/remove/update role/fetch)
- `firestore.rules` — Firestore security rules

### Modified Files
- `src/types/database.ts` — camelCase fields, add Member type, remove deleted_at from Node
- `src/stores/auth-store.ts` — Replace Supabase Auth with Firebase Auth
- `src/lib/api/roadmaps.ts` — Rewrite all functions to Firestore
- `src/lib/api/nodes.ts` — Rewrite all functions to Firestore
- `src/stores/roadmap-store.ts` — Update field references (snake_case → camelCase)
- `src/app/login/page.tsx` — No changes needed (already delegates to auth store)
- `src/components/providers.tsx` — No changes needed (already delegates to auth store)
- `src/app/dashboard/page.tsx` — Update field references (updated_at → updatedAt), add "Shared" badge
- `src/app/roadmap/[id]/page.tsx` — Update field references (root_node_id → rootNodeId)
- `src/components/roadmap/node-detail.tsx` — Update field references (created_at → createdAt)
- `src/components/roadmap/trash-panel.tsx` — Update field references (node_snapshot → nodeSnapshot, expires_at → expiresAt)
- `src/components/roadmap/tree-node.tsx` — Update field references if any snake_case
- `package.json` — Remove @supabase/*, add firebase

### Deleted Files
- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/middleware.ts`
- `src/middleware.ts`
- `src/app/auth/callback/route.ts`
- `supabase/schema.sql`

---

## Chunk 1: Dependencies & Firebase Setup

### Task 1: Swap npm packages

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove Supabase packages and add Firebase**

```bash
npm uninstall @supabase/ssr @supabase/supabase-js
npm install firebase
```

- [ ] **Step 2: Verify install succeeds**

Run: `npm ls firebase`
Expected: `firebase@11.x.x` listed

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: swap supabase for firebase dependency"
```

---

### Task 2: Create Firebase config

**Files:**
- Create: `src/lib/firebase/config.ts`

- [ ] **Step 1: Create the config file**

```typescript
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/firebase/config.ts
git commit -m "feat: add firebase config from env vars"
```

---

### Task 3: Create Firebase client singleton

**Files:**
- Create: `src/lib/firebase/client.ts`

- [ ] **Step 1: Create the lazy singleton client**

This mirrors the existing pattern in `src/lib/supabase/client.ts` — lazy init to avoid SSG module-level instantiation.

```typescript
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";
import { firebaseConfig } from "./config";

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

function getApp(): FirebaseApp {
  if (!app) {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirestoreDb(): Firestore {
  if (!db) {
    db = getFirestore(getApp());
  }
  return db;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getApp());
  }
  return auth;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/firebase/client.ts
git commit -m "feat: add firebase client with lazy singleton init"
```

---

### Task 4: Create Firestore security rules file

**Files:**
- Create: `firestore.rules`

- [ ] **Step 1: Create the rules file**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function getMemberRole(roadmapId) {
      return get(/databases/$(database)/documents/roadmaps/$(roadmapId)/members/$(request.auth.uid)).data.role;
    }

    function isMember(roadmapId) {
      return exists(/databases/$(database)/documents/roadmaps/$(roadmapId)/members/$(request.auth.uid));
    }

    function isEditor(roadmapId) {
      let role = getMemberRole(roadmapId);
      return role == "owner" || role == "editor";
    }

    function isOwner(roadmapId) {
      return getMemberRole(roadmapId) == "owner";
    }

    match /roadmaps/{roadmapId} {
      allow read: if isMember(roadmapId);
      allow create: if request.auth != null
                    && request.resource.data.ownerId == request.auth.uid;
      allow update: if isEditor(roadmapId);
      allow delete: if isOwner(roadmapId);

      match /members/{userId} {
        allow read: if isMember(roadmapId);
        allow write: if isOwner(roadmapId);
      }

      match /nodes/{nodeId} {
        allow read: if isMember(roadmapId);
        allow create, update, delete: if isEditor(roadmapId);
      }

      match /trash/{trashId} {
        allow read: if isMember(roadmapId);
        allow create, delete: if isEditor(roadmapId);
      }
    }

    match /userRoadmaps/{userId}/roadmaps/{roadmapId} {
      allow read: if request.auth.uid == userId;
      allow write: if request.auth.uid == userId
                   || isOwner(roadmapId);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add firestore.rules
git commit -m "feat: add firestore security rules with role-based access"
```

---

## Chunk 2: Types & Auth

### Task 5: Update TypeScript types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Rewrite types to camelCase and add Member type**

Replace the entire file contents with:

```typescript
export interface Roadmap {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  rootNodeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Node {
  id: string;
  roadmapId: string;
  parentId: string | null;
  path: string;
  position: number;
  title: string;
  description: string | null;
  link: string | null;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MemberRole = "owner" | "editor" | "viewer";

export interface Member {
  userId: string;
  role: MemberRole;
  addedAt: string;
  email?: string;
  displayName?: string;
}

export interface TrashEntry {
  id: string;
  roadmapId: string;
  nodeSnapshot: NodeSnapshot;
  parentId: string | null;
  originalNodeId: string;
  deletedAt: string;
  expiresAt: string;
}

export interface NodeSnapshot {
  node: Node;
  children: NodeSnapshot[];
}

export type RoadmapInsert = Pick<Roadmap, "title" | "description">;
export type NodeUpdate = Partial<
  Pick<Node, "title" | "description" | "link" | "isCompleted" | "position" | "parentId">
>;

export interface UserRoadmapEntry {
  roadmapId: string;
  role: MemberRole;
  title: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: update types for firebase - camelCase, add Member and UserRoadmapEntry"
```

---

### Task 6: Rewrite auth store for Firebase

**Files:**
- Modify: `src/stores/auth-store.ts`

- [ ] **Step 1: Replace Supabase auth with Firebase auth**

Replace the entire file contents with:

```typescript
import { create } from "zustand";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  GithubAuthProvider,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";

interface AuthState {
  user: User | null;
  loading: boolean;
  initialize: () => void;
  signInWithOAuth: (provider: "google" | "github") => Promise<void>;
  signOut: () => Promise<void>;
}

const providers = {
  google: () => new GoogleAuthProvider(),
  github: () => new GithubAuthProvider(),
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  initialize: () => {
    const auth = getFirebaseAuth();
    onAuthStateChanged(auth, (user) => {
      set({ user, loading: false });
    });
  },

  signInWithOAuth: async (provider) => {
    const auth = getFirebaseAuth();
    await signInWithPopup(auth, providers[provider]());
  },

  signOut: async () => {
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
    set({ user: null });
  },
}));
```

Note: `initialize()` is no longer async — `onAuthStateChanged` is a listener, not a promise. The existing call in `src/components/providers.tsx` will still work since the return value was never used.

- [ ] **Step 2: Verify the app builds**

Run: `npm run build`
Expected: Build will fail because api files still import supabase — that's expected at this stage. Verify the auth store itself has no type errors by checking the build output for `auth-store.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/stores/auth-store.ts
git commit -m "feat: replace supabase auth with firebase auth"
```

---

## Chunk 3: API Layer — Roadmaps & Nodes

### Task 7: Rewrite roadmaps API

**Files:**
- Modify: `src/lib/api/roadmaps.ts`

- [ ] **Step 1: Replace entire file with Firestore implementation**

```typescript
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
    description: null,
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

  // Update denormalized title in userRoadmaps for all members
  if (updates.title) {
    const membersSnap = await getDocs(
      collection(db, "roadmaps", id, "members")
    );
    const batch = writeBatch(db);
    for (const memberDoc of membersSnap.docs) {
      batch.update(
        doc(db, "userRoadmaps", memberDoc.id, "roadmaps", id),
        { title: updates.title, updatedAt: serverTimestamp() }
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

  // Delete all subcollections (nodes, trash, members)
  // Firestore batches have a 500-operation limit. Chunk if needed.
  const subcollections = ["nodes", "trash", "members"];
  for (const sub of subcollections) {
    const snap = await getDocs(collection(db, "roadmaps", id, sub));
    const docs = snap.docs;
    // Process in chunks of 400 to stay under batch limit (members add 2 ops each)
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/api/roadmaps.ts
git commit -m "feat: rewrite roadmaps API for firestore with batched writes"
```

---

### Task 8: Rewrite nodes API

**Files:**
- Modify: `src/lib/api/nodes.ts`

- [ ] **Step 1: Replace entire file with Firestore implementation**

```typescript
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

  // Return with client-side timestamp since serverTimestamp resolves on server
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

  // We need roadmapId to locate the node in the subcollection.
  // The caller should pass it. If not passed, we need to find it.
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

  // Firestore batches have a 500-operation limit.
  // For most trees this is fine. For very large trees, chunk the batch.
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
      // Re-parent to root
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
```

**Important API signature changes:**
- `updateNode()` now requires `roadmapId` as a third parameter (needed to locate subcollection)
- `permanentlyDeleteTrashEntry()` now requires `roadmapId` as a second parameter
- These will be wired through the store in Task 10

- [ ] **Step 2: Commit**

```bash
git add src/lib/api/nodes.ts
git commit -m "feat: rewrite nodes API for firestore with hard delete and batched writes"
```

---

### Task 9: Create members API

**Files:**
- Create: `src/lib/api/members.ts`

- [ ] **Step 1: Create member management functions**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/api/members.ts
git commit -m "feat: add members API for role-based collaboration"
```

---

## Chunk 4: Store & Component Updates

### Task 10: Update roadmap store for new API signatures and camelCase

**Files:**
- Modify: `src/stores/roadmap-store.ts`

- [ ] **Step 1: Update field references and API calls**

The store uses `Node` type fields. These changes are needed:

1. `node.parent_id` → `node.parentId` (throughout)
2. `node.is_completed` → `node.isCompleted` (throughout)
3. `updateNode` call now needs `roadmapId` — pass `currentRoadmapId`
4. `permanentlyDeleteTrashEntry` now needs `roadmapId`

Replace the entire file with:

```typescript
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
  childrenIndex: Map<string, string[]>;
  selectedNodeId: string | null;
  expandedNodes: Set<string>;
  focusedNodeId: string | null;
  viewMode: ViewMode;
  trashEntries: TrashEntry[];
  loading: boolean;
  saving: boolean;
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

function buildChildrenIndex(nodes: Map<string, Node>): Map<string, string[]> {
  const index = new Map<string, string[]>();
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

      const expanded = new Set<string>();
      for (const node of nodes) {
        if (!node.parentId) {
          expanded.add(node.id);
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
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/roadmap-store.ts
git commit -m "feat: update roadmap store for firebase API signatures and camelCase fields"
```

---

### Task 11: Update dashboard page for camelCase fields

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Update field references**

In `src/app/dashboard/page.tsx`, make these changes:

1. Line 205: `roadmap.updated_at` → `roadmap.updatedAt`

Find and replace:
```typescript
{new Date(roadmap.updated_at).toLocaleDateString(
```
With:
```typescript
{new Date(roadmap.updatedAt).toLocaleDateString(
```

- [ ] **Step 2: Update Roadmap type usage**

The `fetchRoadmaps()` return type now includes `role`. Update the state type:

```typescript
const [roadmaps, setRoadmaps] = useState<(Roadmap & { role?: string })[]>([]);
```

- [ ] **Step 3: Add "Shared" badge to dashboard cards**

After the roadmap title `<h3>`, add a badge when the user is not the owner:

```tsx
{roadmap.role && roadmap.role !== "owner" && (
  <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
    Shared
  </span>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: update dashboard for camelCase fields and add Shared badge"
```

---

### Task 12: Update roadmap editor page for camelCase fields

**Files:**
- Modify: `src/app/roadmap/[id]/page.tsx`

- [ ] **Step 1: Update field references**

In `src/app/roadmap/[id]/page.tsx`, global find-and-replace `root_node_id` with `rootNodeId` (all occurrences).

- [ ] **Step 2: Commit**

```bash
git add src/app/roadmap/[id]/page.tsx
git commit -m "fix: update roadmap editor field references to camelCase"
```

---

### Task 13: Update node-detail component

**Files:**
- Modify: `src/components/roadmap/node-detail.tsx`

- [ ] **Step 1: Update field references**

Line 246: `node.created_at` → `node.createdAt`

Find and replace:
```typescript
{new Date(node.created_at).toLocaleDateString(undefined, {
```
With:
```typescript
{new Date(node.createdAt).toLocaleDateString(undefined, {
```

- [ ] **Step 2: Commit**

```bash
git add src/components/roadmap/node-detail.tsx
git commit -m "fix: update node-detail field references to camelCase"
```

---

### Task 14: Update trash-panel component

**Files:**
- Modify: `src/components/roadmap/trash-panel.tsx`

- [ ] **Step 1: Update field references**

Line 53: `entry.node_snapshot` → `entry.nodeSnapshot`
Line 58: `entry.expires_at` → `entry.expiresAt`

Find and replace:
```typescript
const snapshot = entry.node_snapshot as NodeSnapshot;
```
With:
```typescript
const snapshot = entry.nodeSnapshot;
```

And:
```typescript
(new Date(entry.expires_at).getTime() - Date.now()) /
```
With:
```typescript
(new Date(entry.expiresAt).getTime() - Date.now()) /
```

- [ ] **Step 2: Commit**

```bash
git add src/components/roadmap/trash-panel.tsx
git commit -m "fix: update trash-panel field references to camelCase"
```

---

### Task 15: Update tree-node and progress-bar components

**Files:**
- Modify: `src/components/roadmap/tree-node.tsx`
- Modify: `src/components/roadmap/progress-bar.tsx`

- [ ] **Step 1: Update tree-node.tsx**

Global find-and-replace in `src/components/roadmap/tree-node.tsx`:
- `is_completed` → `isCompleted` (5 occurrences: lines 37, 87, 92, 94, 119)

- [ ] **Step 2: Update progress-bar.tsx**

Global find-and-replace in `src/components/roadmap/progress-bar.tsx`:
- `is_completed` → `isCompleted` (4 occurrences: lines 28, 39, 72, 74)

- [ ] **Step 2: Commit**

```bash
git add src/components/roadmap/tree-node.tsx src/components/roadmap/progress-bar.tsx
git commit -m "fix: update tree-node and progress-bar field references to camelCase"
```

---

### Task 16: Update remaining components

**Files:**
- Modify: `src/components/roadmap/breadcrumbs.tsx`
- Modify: `src/components/roadmap/card-view.tsx`
- Modify: `src/components/roadmap/use-keyboard-shortcuts.ts`

- [ ] **Step 1: Update breadcrumbs.tsx**

Global find-and-replace in `src/components/roadmap/breadcrumbs.tsx`:
- `node.parent_id` → `node.parentId` (line 22)

- [ ] **Step 2: Search remaining files for snake_case references**

Search all remaining files in `src/components/roadmap/` for `is_completed`, `parent_id`, `root_node_id`, `created_at`, `updated_at`, `deleted_at`, `node_snapshot`, `expires_at`, `roadmap_id` and update to camelCase equivalents.

- [ ] **Step 2: Commit**

```bash
git add src/components/roadmap/
git commit -m "fix: update remaining component field references to camelCase"
```

---

## Chunk 5: Cleanup & Verification

### Task 17: Delete Supabase files

**Files:**
- Delete: `src/lib/supabase/client.ts`
- Delete: `src/lib/supabase/server.ts`
- Delete: `src/lib/supabase/middleware.ts`
- Delete: `src/middleware.ts`
- Delete: `src/app/auth/callback/route.ts`
- Delete: `supabase/schema.sql`

- [ ] **Step 1: Remove all Supabase-related files**

```bash
rm src/lib/supabase/client.ts
rm src/lib/supabase/server.ts
rm src/lib/supabase/middleware.ts
rm src/middleware.ts
rm src/app/auth/callback/route.ts
rm supabase/schema.sql
rmdir src/lib/supabase
rmdir src/app/auth/callback
rmdir src/app/auth
rmdir supabase
```

- [ ] **Step 2: Commit**

```bash
git add -u
git commit -m "chore: remove supabase files and middleware"
```

---

### Task 18: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md to reflect Firebase architecture**

Update the architecture section to reference Firebase instead of Supabase, note the subcollection model, the members/collaboration system, and the removal of middleware.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for firebase migration"
```

---

## Chunk 6: Collaboration UI

### Task 20: Create share dialog component

**Files:**
- Create: `src/components/roadmap/share-dialog.tsx`

- [ ] **Step 1: Create the share dialog**

Build a dialog component with:
- Text input for email address
- Role picker dropdown (editor/viewer — owner is not assignable)
- "Invite" button that calls `addMember()` from `src/lib/api/members.ts`
- Members list showing current collaborators with role badges
- Remove button for each member (only shown to owner)
- Role change dropdown for each member (only shown to owner)

The dialog should:
- Accept `roadmapId` and `roadmapTitle` props
- Fetch members on open via `fetchMembers(roadmapId)`
- Show current user's role
- Prevent owner from removing themselves

**Note:** Email → userId resolution requires a `/users` collection (see Task 21). For now, the input accepts userId directly. A Cloud Function or `/users` lookup will be added in Task 21.

- [ ] **Step 2: Commit**

```bash
git add src/components/roadmap/share-dialog.tsx
git commit -m "feat: add share dialog for roadmap collaboration"
```

---

### Task 21: Add users collection for email lookup

**Files:**
- Create: `src/lib/api/users.ts`
- Modify: `src/stores/auth-store.ts`
- Modify: `firestore.rules`

- [ ] **Step 1: Create users API**

Create `src/lib/api/users.ts` with a `findUserByEmail(email)` function that queries a `/users` collection:

```typescript
import { getDocs, collection, query, where } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";

export async function findUserByEmail(email: string): Promise<{ uid: string; email: string; displayName?: string } | null> {
  const db = getFirestoreDb();
  const q = query(collection(db, "users"), where("email", "==", email));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { uid: doc.id, email: doc.data().email, displayName: doc.data().displayName };
}
```

- [ ] **Step 2: Write user profile on auth state change**

In `src/stores/auth-store.ts`, update the `onAuthStateChanged` callback to upsert a `/users/{uid}` document with `email` and `displayName` when a user signs in. This populates the lookup collection.

- [ ] **Step 3: Add security rules for users collection**

Add to `firestore.rules`:

```
match /users/{userId} {
  allow read: if request.auth != null;
  allow write: if request.auth.uid == userId;
}
```

- [ ] **Step 4: Update share dialog to use email lookup**

Update the share dialog to call `findUserByEmail()` and show an error if no user is found.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/users.ts src/stores/auth-store.ts firestore.rules src/components/roadmap/share-dialog.tsx
git commit -m "feat: add users collection for email lookup in share dialog"
```

---

### Task 22: Wire share button into roadmap editor

**Files:**
- Modify: `src/app/roadmap/[id]/page.tsx`

- [ ] **Step 1: Add share button and dialog to editor header**

Import `ShareDialog` and add a "Share" button in the editor header (next to the trash button). Wire it with `roadmapId` and `roadmap.title`.

- [ ] **Step 2: Commit**

```bash
git add src/app/roadmap/[id]/page.tsx
git commit -m "feat: add share button to roadmap editor"
```

---

### Task 23: Set up .env.local template

**Files:**
- Create: `.env.local.example`

- [ ] **Step 1: Create env template**

```
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

- [ ] **Step 2: Commit**

```bash
git add .env.local.example
git commit -m "docs: add firebase env template"
```

---

### Task 24: Final build verification

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: No errors

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 3: Fix any remaining issues and commit**

```bash
git add -A
git commit -m "fix: resolve any remaining issues from firebase migration"
```
