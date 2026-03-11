import { create } from "zustand";
import {
  onAuthStateChanged,
  signInWithPopup,
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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  initialize: () => {
    const auth = getFirebaseAuth();
    onAuthStateChanged(auth, (user) => {
      set({ user, loading: false });
      if (user) {
        const db = getFirestoreDb();
        setDoc(
          doc(db, "users", user.uid),
          { email: user.email, displayName: user.displayName },
          { merge: true }
        );
      }
    });
  },

  signInWithOAuth: async (provider) => {
    const auth = getFirebaseAuth();
    await signInWithPopup(auth, providers[provider]());
  },

  signOut: async () => {
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
    set({ user: null });
  },
}));
