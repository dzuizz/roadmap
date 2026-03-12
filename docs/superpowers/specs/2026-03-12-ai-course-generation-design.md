# AI Course Generation Design

## Overview

Add a feature where users can generate a full roadmap/course from a simple text prompt using the OpenAI API. Users provide their own OpenAI API key via a settings dialog on the dashboard.

## Data Model

Extend the existing `/users/{userId}` document:

```
/users/{userId}
  - email: string           (existing)
  - displayName: string     (existing)
  - openaiApiKey: string    (new, plain text)
```

Secured by existing Firestore rules — only the user can read/write their own doc. No rule changes needed.

## API Route

New Next.js API route at `src/app/api/generate-roadmap/route.ts`:

1. Receives `{ prompt: string }` via POST
2. Verifies Firebase Auth token (passed as Bearer header)
3. Reads user's `openaiApiKey` from Firestore via Firebase Admin SDK (server-side)
4. Calls OpenAI API (`gpt-4o-mini`) with a system prompt instructing it to return a JSON tree (title, description, children[], recursive, AI decides depth)
5. Validates response structure, retries once if malformed
6. Returns the generated tree as JSON

Requires `firebase-admin` and `openai` packages. Firebase Admin initialized via `FIREBASE_SERVICE_ACCOUNT` env var (base64-encoded service account JSON).

## Generation Flow

1. User clicks "Generate Roadmap" on dashboard
2. Dialog opens with a textarea for the prompt
3. User submits -> POST to `/api/generate-roadmap` with Firebase Auth token
4. API route generates tree, returns JSON
5. Client creates roadmap + all nodes via batched Firestore writes
6. Redirects to the new roadmap

## UI Components

### Settings Dialog (`src/components/settings-dialog.tsx`)

- Simple dialog with password-masked API key input + save button
- Accessible from a gear icon in the dashboard header
- Reads/writes to `/users/{userId}` via `src/lib/api/settings.ts`

### Generate Dialog (`src/components/generate-roadmap-dialog.tsx`)

- Textarea for prompt (e.g., "Full-stack web development course")
- Generate button with loading state during generation
- If no API key is set, shows inline message directing user to settings
- On success, creates roadmap and redirects to it

## Error Handling

- **No API key** — generate dialog checks key existence before allowing submission, shows inline message
- **Invalid API key (401)** — dialog shows "Invalid API key" message
- **Rate limit / server error** — dialog shows "Generation failed, try again"
- **Malformed AI response** — API route validates JSON, retries once, returns error if still bad
- **Auth verification fails** — API route returns 401

## File Changes

### New Files

- `src/lib/firebase/admin.ts` — Firebase Admin SDK init (server-side, lazy singleton)
- `src/app/api/generate-roadmap/route.ts` — API route for AI generation
- `src/lib/api/settings.ts` — client-side get/save API key functions
- `src/components/settings-dialog.tsx` — API key settings dialog
- `src/components/generate-roadmap-dialog.tsx` — prompt + generation dialog

### Modified Files

- `src/app/dashboard/page.tsx` — add "Generate Roadmap" button + gear icon, render dialogs
- `package.json` — add `firebase-admin`, `openai`
- `.env.local.example` — add `FIREBASE_SERVICE_ACCOUNT`

### Unchanged

- Roadmap/node/tree components
- Auth flow
- Firestore security rules
