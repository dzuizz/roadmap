import { getDocs, collection, query, where } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";

export async function findUserByEmail(
  email: string
): Promise<{ uid: string; email: string; displayName?: string } | null> {
  const db = getFirestoreDb();
  const q = query(collection(db, "users"), where("email", "==", email));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return {
    uid: d.id,
    email: d.data().email,
    displayName: d.data().displayName,
  };
}
