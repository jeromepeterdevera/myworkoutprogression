"use client";

import { useEffect, useState } from "react";

/** Number input that keeps the raw text while typing (so "22." doesn't lose its dot). */
export default function NumInput({
  value,
  onChange,
  decimal,
  placeholder,
  ariaLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  decimal?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));

  useEffect(() => {
    const parsed = text === "" ? null : Number(text);
    if (parsed !== value) setText(value == null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const raw = e.target.value.replace(",", ".");
        const ok = decimal ? /^\d*\.?\d*$/.test(raw) : /^\d*$/.test(raw);
        if (!ok) return;
        setText(raw);
        if (raw === "" || raw === ".") onChange(null);
        else onChange(Number(raw));
      }}
      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-center text-base outline-none focus:border-zinc-900 placeholder:text-zinc-300"
    />
  );
}
