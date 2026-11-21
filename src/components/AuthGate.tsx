"use client";

import { useAuth, signInWithMicrosoft } from "@/lib/useAuth";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center text-zinc-400">Loading…</div>;
  }

  if (!session) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <div>
          <h1 className="text-3xl font-bold">Workout Log</h1>
          <p className="mt-2 text-zinc-500">Track your sessions and progressive overload.</p>
        </div>
        <button
          onClick={signInWithMicrosoft}
          className="flex items-center gap-3 rounded-lg bg-zinc-900 px-5 py-3 font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
        >
          <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden>
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
          </svg>
          Sign in with Microsoft / Outlook
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
