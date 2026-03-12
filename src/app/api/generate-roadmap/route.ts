import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

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

async function generateWithOpenAI(apiKey: string, prompt: string): Promise<GeneratedNode> {
  const openai = new OpenAI({ apiKey });

  let tree: GeneratedNode | null = null;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
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
        lastError = "Invalid tree structure from AI";
      }
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        if (err.status === 401) throw new APIKeyError("Invalid OpenAI API key. Check your key in Settings.");
        if (err.status === 429) throw new RateLimitError("OpenAI rate limit reached. Please try again later.");
      }
      lastError = err instanceof Error ? err.message : "Unknown error";
    }
  }

  if (!tree) throw new Error(lastError || "Failed to generate roadmap");
  return tree;
}

async function generateWithGemini(apiKey: string, prompt: string): Promise<GeneratedNode> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
    },
  });

  let tree: GeneratedNode | null = null;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await model.generateContent(
        `${SYSTEM_PROMPT}\n\nTopic: ${prompt}`
      );

      const content = result.response.text();
      if (!content) {
        lastError = "Empty response from Gemini";
        continue;
      }

      const parsed = JSON.parse(content);
      if (validateTree(parsed)) {
        tree = parsed;
        break;
      } else {
        lastError = "Invalid tree structure from AI";
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("API_KEY_INVALID") || message.includes("API key not valid")) {
        throw new APIKeyError("Invalid Gemini API key. Check your key in Settings.");
      }
      if (message.includes("RATE_LIMIT") || message.includes("429")) {
        throw new RateLimitError("Gemini rate limit reached. Please try again later.");
      }
      lastError = message;
    }
  }

  if (!tree) throw new Error(lastError || "Failed to generate roadmap");
  return tree;
}

class APIKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "APIKeyError";
  }
}

class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await verifyToken(req);
    const body = await req.json();
    const prompt = (body.prompt as string)?.trim();
    const provider = (body.provider as string) || "gemini";

    if (!prompt || prompt.length === 0) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    if (prompt.length > 1000) {
      return NextResponse.json({ error: "Prompt is too long (max 1000 characters)" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();

    const apiKey = provider === "openai"
      ? userData?.openaiApiKey
      : userData?.geminiApiKey;

    if (!apiKey) {
      const providerName = provider === "openai" ? "OpenAI" : "Gemini";
      return NextResponse.json(
        { error: `No ${providerName} API key configured. Add one in Settings.` },
        { status: 400 }
      );
    }

    const tree = provider === "openai"
      ? await generateWithOpenAI(apiKey, prompt)
      : await generateWithGemini(apiKey, prompt);

    return NextResponse.json({ tree });
  } catch (error) {
    if (error instanceof Error && error.message === "Missing auth token") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof APIKeyError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error("Generate roadmap error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate roadmap" },
      { status: 500 }
    );
  }
}
