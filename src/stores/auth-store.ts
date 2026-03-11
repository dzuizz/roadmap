import { create } from "zustand";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  GithubAuthProvider,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";

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
