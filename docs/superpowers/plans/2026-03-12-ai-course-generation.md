# AI Course Generation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to generate a full roadmap/course from a text prompt using the OpenAI API, with API key management via a settings dialog.

**Architecture:** Next.js API route receives prompt + Firebase Auth token, reads the user's OpenAI API key from Firestore via Admin SDK, calls OpenAI to generate a tree structure, returns JSON. Client creates the roadmap and all nodes from the response.

**Tech Stack:** OpenAI SDK, Firebase Admin SDK, Next.js API routes, existing Firestore + Zustand stack

---

## File Structure

### New Files
- `src/lib/firebase/admin.ts` — Firebase Admin SDK init (server-side lazy singleton)
- `src/lib/api/settings.ts` — Client-side get/save API key
- `src/components/settings-dialog.tsx` — API key settings dialog
- `src/components/generate-roadmap-dialog.tsx` — Prompt input + generation dialog
- `src/app/api/generate-roadmap/route.ts` — API route for AI generation

### Modified Files
- `src/app/dashboard/page.tsx` — Add gear icon + "Generate Roadmap" button, render both dialogs
- `.env.local.example` — Add `FIREBASE_SERVICE_ACCOUNT`
- `package.json` — Add `firebase-admin`, `openai`

---

## Chunk 1: Dependencies & Server-Side Firebase

### Task 1: Add dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
npm install firebase-admin openai
```

- [ ] **Step 2: Update .env.local.example**

Add to the end of `.env.local.example`:

```
# Firebase Admin (base64-encoded service account JSON)
FIREBASE_SERVICE_ACCOUNT=
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .env.local.example
git commit -m "chore: add firebase-admin and openai dependencies"
```

---

### Task 2: Create Firebase Admin singleton

**Files:**
- Create: `src/lib/firebase/admin.ts`

- [ ] **Step 1: Create the server-side Admin SDK init**

```typescript
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App | null = null;
let db: Firestore | null = null;

function getAdminApp(): App {
  if (!app) {
    if (getApps().length > 0) {
      app = getApps()[0];
    } else {
      const serviceAccount = JSON.parse(
        Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT!, "base64").toString()
      );
      app = initializeApp({ credential: cert(serviceAccount) });
    }
  }
  return app;
}

export function getAdminFirestore(): Firestore {
  if (!db) {
    db = getFirestore(getAdminApp());
  }
  return db;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/firebase/admin.ts
git commit -m "feat: add firebase admin SDK singleton for server-side access"
```

---

## Chunk 2: Settings (API Key Management)

### Task 3: Create settings API module

**Files:**
- Create: `src/lib/api/settings.ts`

- [ ] **Step 1: Create client-side settings functions**

```typescript
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestoreDb, getFirebaseAuth } from "@/lib/firebase/client";

export async function getOpenAIApiKey(): Promise<string | null> {
  const db = getFirestoreDb();
  const auth = getFirebaseAuth();
  const userId = auth.currentUser?.uid;
  if (!userId) return null;

  const snap = await getDoc(doc(db, "users", userId));
  if (!snap.exists()) return null;
  return snap.data().openaiApiKey ?? null;
}

export async function saveOpenAIApiKey(apiKey: string): Promise<void> {
  const db = getFirestoreDb();
  const auth = getFirebaseAuth();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error("Not authenticated");

  await setDoc(
    doc(db, "users", userId),
    { openaiApiKey: apiKey },
    { merge: true }
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/api/settings.ts
git commit -m "feat: add settings API for OpenAI key management"
```

---

### Task 4: Create settings dialog

**Files:**
- Create: `src/components/settings-dialog.tsx`

- [ ] **Step 1: Create the settings dialog component**

The dialog should:
- Accept `open: boolean` and `onOpenChange: (open: boolean) => void` props
- On open, load the current API key via `getOpenAIApiKey()`
- Show a password-masked input with the key (or empty if not set)
- Have a Save button that calls `saveOpenAIApiKey()`
- Show a success message briefly after saving

Use the existing shadcn Dialog component. Follow the same patterns as other dialogs in `src/app/dashboard/page.tsx`.

```typescript
"use client";

import { useState, useEffect } from "react";
import { getOpenAIApiKey, saveOpenAIApiKey } from "@/lib/api/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setSaved(false);
      getOpenAIApiKey().then((key) => {
        if (key) setApiKey(key);
      });
    } else {
      setApiKey("");
    }
  }, [open]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await saveOpenAIApiKey(apiKey.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save API key:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="api-key">OpenAI API Key</Label>
            <Input
              id="api-key"
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Required for AI roadmap generation. Your key is stored securely
              and only accessible by you.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            {saved && (
              <span className="text-xs text-green-600 dark:text-green-400">
                Saved
              </span>
            )}
            <Button onClick={handleSave} disabled={loading || !apiKey.trim()}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings-dialog.tsx
git commit -m "feat: add settings dialog for OpenAI API key"
```

---

## Chunk 3: API Route

### Task 5: Create the generate-roadmap API route

**Files:**
- Create: `src/app/api/generate-roadmap/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import OpenAI from "openai";

interface GeneratedNode {
  title: string;
  description: string | null;
  children: GeneratedNode[];
}

const SYSTEM_PROMPT = `You are a course/roadmap generator. Given a topic, generate a comprehensive learning roadmap as a JSON tree.

Rules:
- Return ONLY valid JSON, no markdown or explanation
- The root node is the course title
- Structure the content hierarchically: sections → topics → subtopics as needed
- Each node has: title (string), description (string or null), children (array)
- Use 2-4 levels of depth depending on the subject complexity
- Leaf nodes should be specific, actionable learning items
- Include 5-15 top-level sections depending on scope
- Keep titles concise (under 60 chars)
- Descriptions should briefly explain the topic (1-2 sentences) or be null for self-explanatory items

Example format:
{
  "title": "Learn Python",
  "description": "A comprehensive guide to Python programming",
  "children": [
    {
      "title": "Getting Started",
      "description": "Setting up your environment and basics",
      "children": [
        { "title": "Install Python", "description": "Download and install Python 3.x", "children": [] },
        { "title": "Hello World", "description": null, "children": [] }
      ]
    }
  ]
}`;

async function verifyToken(req: NextRequest): Promise<string> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing auth token");
  }
  const token = authHeader.slice(7);
  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT!, "base64").toString()
    );
    initializeApp({ credential: cert(serviceAccount) });
  }
  const decoded = await getAuth().verifyIdToken(token);
  return decoded.uid;
}

function validateTree(obj: unknown): obj is GeneratedNode {
  if (!obj || typeof obj !== "object") return false;
  const node = obj as Record<string, unknown>;
  if (typeof node.title !== "string") return false;
  if (node.description !== null && typeof node.description !== "string") return false;
  if (!Array.isArray(node.children)) return false;
  return node.children.every(validateTree);
}

export async function POST(req: NextRequest) {
  try {
    const uid = await verifyToken(req);
    const body = await req.json();
    const prompt = body.prompt as string;

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Read API key from Firestore
    const db = getAdminFirestore();
    const userDoc = await db.collection("users").doc(uid).get();
    const apiKey = userDoc.data()?.openaiApiKey;

    if (!apiKey) {
      return NextResponse.json(
        { error: "No OpenAI API key configured. Add one in Settings." },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });

    let tree: GeneratedNode | null = null;
    let lastError: string | null = null;

    // Try up to 2 times
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt.trim() },
          ],
          temperature: 0.7,
          response_format: { type: "json_object" },
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
          lastError = "Empty response from OpenAI";
          continue;
        }

        const parsed = JSON.parse(content);
        if (validateTree(parsed)) {
          tree = parsed;
          break;
        } else {
          lastError = "Invalid tree structure from OpenAI";
        }
      } catch (err) {
        if (err instanceof OpenAI.APIError) {
          if (err.status === 401) {
            return NextResponse.json(
              { error: "Invalid OpenAI API key. Check your key in Settings." },
              { status: 401 }
            );
          }
          if (err.status === 429) {
            return NextResponse.json(
              { error: "OpenAI rate limit reached. Please try again later." },
              { status: 429 }
            );
          }
        }
        lastError = err instanceof Error ? err.message : "Unknown error";
      }
    }

    if (!tree) {
      return NextResponse.json(
        { error: lastError || "Failed to generate roadmap" },
        { status: 500 }
      );
    }

    return NextResponse.json({ tree });
  } catch (error) {
    if (error instanceof Error && error.message === "Missing auth token") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Generate roadmap error:", error);
    return NextResponse.json(
      { error: "Failed to generate roadmap" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/generate-roadmap/route.ts
git commit -m "feat: add API route for AI roadmap generation"
```

---

## Chunk 4: Generate Dialog & Dashboard Integration

### Task 6: Create generate roadmap dialog

**Files:**
- Create: `src/components/generate-roadmap-dialog.tsx`

- [ ] **Step 1: Create the dialog component**

The dialog should:
- Accept `open`, `onOpenChange`, and `onGenerated: (roadmapId: string) => void` props
- Have a textarea for the prompt
- Check if API key exists before allowing generation (via `getOpenAIApiKey()`)
- Show inline message if no key set
- On submit: get Firebase Auth token, POST to `/api/generate-roadmap`, then create the roadmap + all nodes from the returned tree
- Show loading state during generation
- On success, call `onGenerated` with the new roadmap ID

The node creation logic should:
1. Create the roadmap via `createRoadmap(tree.title, tree.description)`
2. Then recursively create child nodes using `createNode()` from `@/lib/api/nodes`
3. Use a recursive function that walks the tree depth-first

```typescript
"use client";

import { useState, useEffect } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { getOpenAIApiKey } from "@/lib/api/settings";
import * as roadmapsApi from "@/lib/api/roadmaps";
import * as nodesApi from "@/lib/api/nodes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GeneratedNode {
  title: string;
  description: string | null;
  children: GeneratedNode[];
}

interface GenerateRoadmapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (roadmapId: string) => void;
}

async function createNodesRecursive(
  roadmapId: string,
  parentId: string,
  parentPath: string,
  children: GeneratedNode[]
): Promise<void> {
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const node = await nodesApi.createNode(roadmapId, parentId, parentPath, i);
    // Update title and description
    if (child.title !== "Untitled" || child.description) {
      await nodesApi.updateNode(
        node.id,
        {
          title: child.title,
          ...(child.description && { description: child.description }),
        },
        roadmapId
      );
    }
    // Recurse for children
    if (child.children.length > 0) {
      await createNodesRecursive(
        roadmapId,
        node.id,
        node.path,
        child.children
      );
    }
  }
}

export function GenerateRoadmapDialog({
  open,
  onOpenChange,
  onGenerated,
}: GenerateRoadmapDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setPrompt("");
      getOpenAIApiKey().then((key) => setHasApiKey(!!key));
    }
  }, [open]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);

    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/generate-roadmap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate roadmap");
        return;
      }

      const tree = data.tree as GeneratedNode;

      // Create roadmap
      const roadmap = await roadmapsApi.createRoadmap(
        tree.title,
        tree.description || undefined
      );

      // Create child nodes recursively
      if (tree.children.length > 0 && roadmap.rootNodeId) {
        await createNodesRecursive(
          roadmap.id,
          roadmap.rootNodeId,
          `/${roadmap.rootNodeId}`,
          tree.children
        );
      }

      onGenerated(roadmap.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Roadmap with AI</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {hasApiKey === false && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
              No OpenAI API key configured. Add one in Settings (gear icon) to
              use this feature.
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="prompt">What do you want to learn?</Label>
            <Textarea
              id="prompt"
              placeholder="e.g., Full-stack web development with React and Node.js"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              disabled={generating}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={generating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim() || hasApiKey === false}
            >
              {generating ? "Generating..." : "Generate"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/generate-roadmap-dialog.tsx
git commit -m "feat: add generate roadmap dialog with AI integration"
```

---

### Task 7: Wire dialogs into dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add imports**

Add to the imports at the top of `src/app/dashboard/page.tsx`:

```typescript
import { SettingsDialog } from "@/components/settings-dialog";
import { GenerateRoadmapDialog } from "@/components/generate-roadmap-dialog";
```

- [ ] **Step 2: Add state variables**

After the existing state declarations (around line 45), add:

```typescript
const [settingsOpen, setSettingsOpen] = useState(false);
const [generateOpen, setGenerateOpen] = useState(false);
```

- [ ] **Step 3: Add gear icon to header**

In the header, before the "Sign out" button (around line 115), add a settings gear button:

```tsx
<Button
  variant="ghost"
  size="sm"
  className="h-8 w-8 p-0"
  onClick={() => setSettingsOpen(true)}
  title="Settings"
>
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
</Button>
```

- [ ] **Step 4: Add "Generate Roadmap" button**

In the button area next to "New Roadmap" (around line 126-131), add a generate button before the New Roadmap dialog trigger:

```tsx
<div className="flex items-center gap-2">
  <Button size="sm" variant="outline" onClick={() => setGenerateOpen(true)}>
    <SparklesIcon />
    Generate with AI
  </Button>
  <Dialog open={createOpen} onOpenChange={setCreateOpen}>
    ...existing dialog trigger and content...
  </Dialog>
</div>
```

Wrap the existing Dialog and the new button together in a flex container. The existing `<Dialog>` and its `<DialogTrigger>` stay the same.

- [ ] **Step 5: Add SparklesIcon component**

At the bottom of the file, add:

```typescript
function SparklesIcon() {
  return (
    <svg
      className="mr-1.5 h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
      />
    </svg>
  );
}
```

- [ ] **Step 6: Render the dialogs**

At the end of the component, just before the closing `</div>` and after the delete AlertDialog, add:

```tsx
{/* Settings Dialog */}
<SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

{/* Generate Roadmap Dialog */}
<GenerateRoadmapDialog
  open={generateOpen}
  onOpenChange={setGenerateOpen}
  onGenerated={(id) => router.push(`/roadmap/${id}`)}
/>
```

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: add generate roadmap and settings buttons to dashboard"
```

---

### Task 8: Final build verification

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: No errors

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 3: Fix any issues and commit**

If fixes are needed:
```bash
git add -A
git commit -m "fix: resolve issues from AI generation feature"
```
