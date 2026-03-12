import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestoreDb, getFirebaseAuth } from "@/lib/firebase/client";

export type AIProvider = "openai" | "gemini";

export interface AISettings {
  openaiApiKey: string | null;
  geminiApiKey: string | null;
  preferredProvider: AIProvider;
}

export async function getAISettings(): Promise<AISettings> {
  const db = getFirestoreDb();
  const auth = getFirebaseAuth();
  const userId = auth.currentUser?.uid;
  if (!userId) return { openaiApiKey: null, geminiApiKey: null, preferredProvider: "gemini" };

  const snap = await getDoc(doc(db, "users", userId));
  if (!snap.exists()) return { openaiApiKey: null, geminiApiKey: null, preferredProvider: "gemini" };
  const data = snap.data();
  return {
    openaiApiKey: data.openaiApiKey ?? null,
    geminiApiKey: data.geminiApiKey ?? null,
    preferredProvider: data.preferredProvider ?? "gemini",
  };
}

export async function saveAISettings(settings: Partial<{
  openaiApiKey: string;
  geminiApiKey: string;
  preferredProvider: AIProvider;
}>): Promise<void> {
  const db = getFirestoreDb();
  const auth = getFirebaseAuth();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error("Not authenticated");

  await setDoc(
    doc(db, "users", userId),
    settings,
    { merge: true }
  );
}
