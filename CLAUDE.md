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

Three Supabase tables (`supabase/schema.sql`):
- **roadmaps** — owned by a user, points to a `root_node_id`
- **nodes** — tree structure using adjacency list (`parent_id`) + materialized path (`path` like `/<root-uuid>/<child-uuid>/...`). Soft-deleted via `deleted_at`.
- **trash_entries** — stores `node_snapshot` (recursive JSON of deleted subtree) for 30-day undo. On restore, snapshots are upserted back as live nodes.

Roadmap creation is a 3-step sequence: insert roadmap → insert root node → update roadmap with `root_node_id`.

### Client State (Zustand)

- `roadmap-store.ts` — Flat `Map<id, Node>` for O(1) lookups + pre-built `childrenIndex` (`Map<parentId, sortedChildIds[]>`). Updates are optimistic. Root node title changes sync back to the roadmap title.
- `auth-store.ts` — Supabase auth state with OAuth (Google/GitHub).

### API Layer

`src/lib/api/` contains client-side Supabase calls (not server actions). Each module uses lazy singleton client from `src/lib/supabase/client.ts`. Errors are thrown via `throwIfError()` helper.

### Key Patterns

- **Path-based descendant queries**: subtree operations use `path.startsWith(targetPath + "/")` to find descendants
- **Path imports**: `@/*` maps to `./src/*`
- **UI components**: shadcn/ui in `src/components/ui/`, roadmap-specific in `src/components/roadmap/`
- **Dark mode**: class-based via ThemeProvider, system preference default
- **IDs**: client-generated UUIDs (`uuid` package) rather than database-generated

### Auth Flow

OAuth callback at `/auth/callback/route.ts` exchanges code for session. Middleware (`src/middleware.ts`) refreshes sessions. RLS policies on all tables enforce ownership through roadmap `user_id`.
