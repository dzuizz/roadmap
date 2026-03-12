import { create } from "zustand";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  GithubAuthProvider,
  type User,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirestoreDb } from "@/lib/firebase/client";

interface AuthState {
  user: User | null;
  loading: boolean;
  initialize: () => void;
  signInWithOAuth: (provider: "google" | "github") => Promise<void>;
  signOut: () => Promise<void>;
}

const providers = {
  google: () => new GoogleAuthProvider(),
  github: () => new GithubAuthProvider(),
};

// Track if user doc has been upserted this session to avoid redundant writes
let userDocSynced = false;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  initialize: () => {
    const auth = getFirebaseAuth();
    onAuthStateChanged(auth, (user) => {
      set({ user, loading: false });
      if (user && !userDocSynced) {
        userDocSynced = true;
        const db = getFirestoreDb();
        setDoc(
          doc(db, "users", user.uid),
          { email: user.email, displayName: user.displayName },
          { merge: true }
        );
      }
      if (!user) userDocSynced = false;
    });
  },

  signInWithOAuth: async (provider) => {
    const auth = getFirebaseAuth();
    const authProvider = providers[provider]();
    try {
      await signInWithPopup(auth, authProvider);
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as { code: string }).code === "auth/popup-blocked") {
        await signInWithRedirect(auth, authProvider);
      } else {
        throw error;
      }
    }
  },

  signOut: async () => {
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
    set({ user: null });
  },
}));
