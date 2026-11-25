"use client"

import { useState } from "react"

// Copies a text (the shop link) and says so for a moment.
export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")
  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => setState("copied"),
          () => setState("failed")
        )
      }
      onBlur={() => setState("idle")}
    >
      <span aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : label}
      </span>
    </button>
  )
}
