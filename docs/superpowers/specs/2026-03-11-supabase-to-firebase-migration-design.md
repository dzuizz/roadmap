# Supabase to Firebase Migration Design

## Overview

Migrate Ada Roadmap from Supabase (PostgreSQL + Auth + RLS) to Firebase (Firestore + Firebase Auth). Add role-based collaboration (owner, editor, viewer) per roadmap. Stay on Vercel for hosting. Fresh auth start (no user migration).

## Data Model

### Firestore Collections

```
/roadmaps/{roadmapId}
  - ownerId: string
  - title: string
  - description: string | null
  - rootNodeId: string
  - createdAt: Timestamp
  - updatedAt: Timestamp

  /members/{userId}
    - role: "owner" | "editor" | "viewer"
    - addedAt: Timestamp

  /nodes/{nodeId}
    - parentId: string | null
    - path: string              (materialized path for subtree queries)
    - position: number
    - title: string
    - description: string | null
    - link: string | null
    - isCompleted: boolean
    - createdAt: Timestamp
    - updatedAt: Timestamp

  /trash/{trashId}
    - nodeSnapshot: map         (recursive snapshot)
    - parentId: string | null
    - originalNodeId: string
    - deletedAt: Timestamp
    - expiresAt: Timestamp
```

### Dashboard Index

```
/userRoadmaps/{userId}/roadmaps/{roadmapId}
  - role: "owner" | "editor" | "viewer"
  - title: string              (denormalized)
  - updatedAt: Timestamp
```

Avoids collection group query on `members` for dashboard. Dual-written when roadmap title changes or members are added/removed.

### Key Change: Hard Delete Instead of Soft Delete

Deleted nodes are removed from `/nodes` entirely and stored in `/trash` as snapshots. Eliminates the cost of filtering `deleted_at` on every node load.

## Auth

Replace Supabase Auth with Firebase Auth. Same OAuth providers (Google, GitHub).

- Firebase Auth handles session persistence client-side via `onAuthStateChanged`
- OAuth uses popup flow (`signInWithPopup`) — no server callback route needed
- No middleware needed — route protection is client-side via auth store
- Files removed: `src/middleware.ts`, `src/lib/supabase/middleware.ts`, `src/lib/supabase/server.ts`, `src/app/auth/callback/route.ts`

## API Layer

### roadmaps.ts

- `fetchRoadmaps()` → query `userRoadmaps/{userId}/roadmaps` ordered by `updatedAt` desc
- `fetchRoadmap(id)` → `getDoc` on roadmap document
- `createRoadmap()` → batched write: roadmap doc + root node + members entry + userRoadmaps entry
- `updateRoadmap()` → batched write: roadmap doc + userRoadmaps title for all members
- `deleteRoadmap()` → batched delete: roadmap doc + recursive subcollection cleanup

### nodes.ts

- `fetchNodes(roadmapId)` → `getDocs` on nodes subcollection ordered by position
- `createNode()` → `setDoc` with client-generated UUID
- `updateNode()` → `updateDoc` on specific node
- `deleteNodeWithSubtree()` → batched write: query descendants by path prefix, snapshot to `/trash`, delete node docs
- `restoreFromTrash()` → batched write: re-create nodes from snapshot, delete trash entry
- `permanentlyDeleteTrashEntry()` → `deleteDoc` on trash entry

### members.ts (new)

- `addMember(roadmapId, email, role)` — look up user, write to `members` + `userRoadmaps`
- `removeMember(roadmapId, userId)` — delete from both
- `updateMemberRole(roadmapId, userId, role)` — update both
- `fetchMembers(roadmapId)` → query `members` subcollection

### Cost Patterns

- `throwIfError()` removed — Firestore throws natively
- Batched writes for atomicity and reduced round-trips
- 3-step roadmap creation becomes single atomic batch
- Node loading: 1 query on subcollection, no deleted_at filter

## Security Rules

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

Firestore caches `get()`/`exists()` within a single request, so multiple membership checks don't multiply cost.

## File Changes

### New Files

- `src/lib/firebase/client.ts` — Firebase app + Firestore + Auth init (lazy singleton)
- `src/lib/firebase/config.ts` — Firebase config from env vars
- `src/lib/api/members.ts` — member CRUD
- `firestore.rules` — security rules

### Modified Files

- `src/lib/api/roadmaps.ts` — rewrite to Firestore
- `src/lib/api/nodes.ts` — rewrite to Firestore
- `src/stores/auth-store.ts` — swap to Firebase Auth
- `src/stores/roadmap-store.ts` — minor updates
- `src/app/login/page.tsx` — Firebase OAuth popup
- `src/app/layout.tsx` / `src/components/providers.tsx` — remove Supabase provider
- `src/types/database.ts` — add `Member` type, camelCase fields, remove `deleted_at` from Node
- `src/components/roadmap/*` — minor type updates
- `package.json` — remove `@supabase/*`, add `firebase`
- `.env.local` — Firebase config env vars

### Deleted Files

- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/middleware.ts`
- `src/middleware.ts`
- `src/app/auth/callback/route.ts`
- `supabase/schema.sql`

### Collaboration UI (minimal)

- Share button on roadmap editor → dialog to invite by email with role picker
- Members list showing collaborators and roles
- "Shared" badge on dashboard cards for roadmaps you don't own

### Unchanged

- Zustand store architecture (flat Map + childrenIndex)
- Tree rendering components
- Node detail panel
- Trash panel logic
- Dark mode / theme system
