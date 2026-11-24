"use client"

import { useActionState } from "react"
import { Notice } from "@/components/notice"
import { addPackage, updatePackage, type FormState } from "./actions"

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

// Edit one package, or hide / show it (gap review 2026-11-24).
export function EditPackageForm({
  pkg,
}: {
  pkg: { id: string; title: string; status: string; price: { amount: number; currency_code: string } | null }
}) {
  const [state, action, saving] = useActionState<FormState, FormData>(updatePackage, {})
  const published = pkg.status === "published"
  return (
    <form action={action} className="mt-3 flex flex-col gap-2 border-t border-ui-border-base pt-3">
      <input type="hidden" name="package_id" value={pkg.id} />
      <details>
        <summary className="cursor-pointer py-2 text-sm text-ui-fg-interactive">Edit name or price</summary>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium">Name</span>
            <input className="field" name="title" defaultValue={pkg.title} maxLength={120} />
          </label>
          <label className="flex w-32 flex-col gap-1">
            <span className="text-sm font-medium">Price ({(pkg.price?.currency_code ?? "usd").toUpperCase()})</span>
            <input className="field" name="price" inputMode="decimal" defaultValue={pkg.price ? String(pkg.price.amount) : ""} />
          </label>
          <button className="btn-primary" type="submit" name="intent" value="save" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-secondary" type="submit" name="intent" value={published ? "hide" : "show"} disabled={saving}>
          {published ? "Hide from the shop" : "Show in the shop"}
        </button>
        {state.error && (
          <span role="alert" className="text-sm text-ui-tag-red-text">
            {state.error}
          </span>
        )}
        {state.info && (
          <span role="status" className="text-sm text-ui-tag-green-text">
            {state.info}
          </span>
        )}
      </div>
    </form>
  )
}
