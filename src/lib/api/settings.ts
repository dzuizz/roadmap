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
