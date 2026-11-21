"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export async function signInWithMicrosoft() {
  await supabase().auth.signInWithOAuth({
    provider: "azure",
    options: {
      scopes: "email",
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    },
  });
}

export async function signOut() {
  await supabase().auth.signOut();
}
