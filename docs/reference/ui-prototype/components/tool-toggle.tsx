"use client";

import { useState } from "react";

export function ToolToggle({ name, defaultEnabled }: { name: string; defaultEnabled: boolean }) {
  const [enabled, setEnabled] = useState(defaultEnabled);

  return (
    <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
        aria-label={`Allow ${name}`}
        className="size-[18px] accent-accent"
      />
    </label>
  );
}
