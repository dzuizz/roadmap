# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (Next.js 16, http://localhost:3000)
npm run build    # Production build
npm run lint     # ESLint (next core-web-vitals + typescript)
```

No test framework is configured.

## Architecture

**Ada Roadmap** is a tree-based roadmap editor. Users create roadmaps, each containing a tree of nodes they can expand, collapse, complete, and reorganize.

### Data Model

Firebase Firestore collections:
- **roadmaps/{id}** — owned by a user, points to a `rootNodeId`, includes role-based membership
- **roadmaps/{id}/nodes** — tree structure using adjacency list (`parentId`) + materialized path (`path` like `/<root-uuid>/<child-uuid>/...`). Hard-deleted; deleted subtrees are stored as trash snapshots.
- **roadmaps/{id}/members** — per-roadmap membership with roles: `owner`, `editor`, `viewer`
- **roadmaps/{id}/trash** — stores node snapshots (recursive JSON of deleted subtree) for undo/restore
- **userRoadmaps/{userId}/roadmaps** — denormalized roadmap metadata for fast dashboard queries without cross-collection joins

Roadmap creation is a 3-step sequence: insert roadmap → insert root node → update roadmap with `rootNodeId`.

### Client State (Zustand)

- `roadmap-store.ts` — Flat `Map<id, Node>` for O(1) lookups + pre-built `childrenIndex` (`Map<parentId, sortedChildIds[]>`). Updates are optimistic. Root node title changes sync back to the roadmap title.
- `auth-store.ts` — Firebase Auth state with popup-based OAuth (Google/GitHub). No middleware or server-side session handling required.

### API Layer

`src/lib/api/` contains client-side Firebase calls (not server actions). Each module imports from `src/lib/firebase/`. Errors are thrown via standard try/catch. Modules:
- `roadmaps.ts` — Roadmap CRUD
- `nodes.ts` — Node CRUD, deletion, trash restore
- `members.ts` — Role-based collaboration (invite, update role, remove member)

### Key Patterns

- **Path-based descendant queries**: subtree operations use `path.startsWith(targetPath + "/")` to find descendants
- **Path imports**: `@/*` maps to `./src/*`
- **UI components**: shadcn/ui in `src/components/ui/`, roadmap-specific in `src/components/roadmap/`
- **Dark mode**: class-based via ThemeProvider, system preference default
- **IDs**: client-generated UUIDs (`uuid` package)
- **Security**: Firestore security rules in `firestore.rules` enforce ownership and role checks — no RLS, no middleware

### Auth Flow

Firebase Auth with popup-based OAuth (`signInWithPopup`). No server-side callback route or middleware required. Auth state is managed client-side in `auth-store.ts`. Access control is enforced via Firestore security rules per roadmap role.
