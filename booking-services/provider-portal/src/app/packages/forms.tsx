"use client"

import { useActionState } from "react"
import { Notice } from "@/components/notice"
import { addPackage, type FormState } from "./actions"

export type Choice = { variant_id: string; label: string }

export function AddPackageForm({ choices, currency }: { choices: Choice[]; currency: string }) {
  const [state, action, saving] = useActionState<FormState, FormData>(addPackage, {})
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Name</span>
        <input className="field" name="title" required maxLength={120} placeholder="e.g. Family check-up morning" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Description (optional)</span>
        <textarea className="field" name="description" rows={2} maxLength={2000} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Price for the whole package ({currency.toUpperCase()})</span>
        <input className="field w-40" name="price" type="number" min={0} step="0.01" required />
      </label>
      <p className="text-sm font-medium">Parts, on the event day</p>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex flex-wrap gap-3">
          <select className="field" name={`variant_${i}`} defaultValue="" aria-label={`Part ${i + 1} service`}>
            <option value="">{i === 0 ? "Choose a service" : "(no part)"}</option>
            {choices.map((c) => (
              <option key={c.variant_id} value={c.variant_id}>
                {c.label}
              </option>
            ))}
          </select>
          <input className="field w-32" name={`time_${i}`} type="time" aria-label={`Part ${i + 1} time`} />
          <input className="field" name={`label_${i}`} maxLength={80} placeholder="Label (optional)" aria-label={`Part ${i + 1} label`} />
        </div>
      ))}
      <Notice state={state} />
      <button className="btn-primary self-start" type="submit" disabled={saving || !choices.length}>
        {saving ? "Adding…" : "Add package"}
      </button>
    </form>
  )
}
