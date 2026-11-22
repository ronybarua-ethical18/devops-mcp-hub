"use client";

import { useState } from "react";
import { buttonStyles } from "./buttons";

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (http, iframe). The field stays selectable.
    }
  }

  return (
    <button type="button" onClick={copy} className={buttonStyles.primary} aria-live="polite">
      {copied ? "Copied" : label}
    </button>
  );
}
