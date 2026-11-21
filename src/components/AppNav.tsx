"use client";

import Link from "next/link";
import { signOut } from "@/lib/useAuth";

const LINKS = [
  { value: "calendar", href: "/", label: "Calendar" },
  { value: "dashboard", href: "/dashboard", label: "Dashboard" },
  { value: "profile", href: "/profile", label: "Profile" },
] as const;

export default function AppNav({ current }: { current: (typeof LINKS)[number]["value"] }) {
  return (
    <nav className="mb-3 flex items-center gap-1 border-b border-zinc-200 pb-2 text-sm">
      {LINKS.map((l) => (
        <Link
          key={l.value}
          href={l.href}
          className={`rounded-md px-2.5 py-1.5 font-medium ${current === l.value ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200"}`}
        >
          {l.label}
        </Link>
      ))}
      <button onClick={signOut} className="ml-auto rounded-md px-2 py-1.5 text-zinc-500 hover:bg-zinc-200">
        Sign out
      </button>
    </nav>
  );
}
