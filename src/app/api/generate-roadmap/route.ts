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
  // Ensure Admin SDK is initialized via the singleton
  getAdminFirestore();
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
