"use client"

import { useActionState } from "react"
import { Notice } from "@/components/notice"
import { addService, updateService, type FormState } from "./actions"

export function AddServiceForm({ currency }: { currency: string }) {
  const [state, action, saving] = useActionState<FormState, FormData>(addService, {})
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Name</span>
        <input className="field" name="title" required maxLength={120} placeholder="e.g. Consultation" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Description (optional)</span>
        <textarea className="field" name="description" rows={3} maxLength={2000} />
      </label>
      <p className="text-sm font-medium">Lengths and prices ({currency.toUpperCase()})</p>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <input
            className="field"
            name={`minutes_${i}`}
            type="number"
            min={5}
            max={720}
            step={5}
            placeholder="Minutes"
            aria-label={`Length ${i + 1} in minutes`}
            defaultValue={i === 0 ? 30 : undefined}
          />
          <input
            className="field"
            name={`price_${i}`}
            type="number"
            min={0}
            step="0.01"
            placeholder="Price"
            aria-label={`Length ${i + 1} price`}
          />
        </div>
      ))}
      <Notice state={state} />
      <button className="btn-primary self-start" type="submit" disabled={saving}>
        {saving ? "Adding…" : "Add service"}
      </button>
    </form>
  )
}

export function VisibilityButton({ serviceId, published }: { serviceId: string; published: boolean }) {
  const [state, action, working] = useActionState<FormState, FormData>(updateService, {})
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="service_id" value={serviceId} />
      <input type="hidden" name="status" value={published ? "draft" : "published"} />
      <button className="btn-secondary" type="submit" disabled={working}>
        {published ? "Hide from the shop" : "Show in the shop"}
      </button>
      {state.error && <span className="text-xs text-ui-tag-red-text">{state.error}</span>}
    </form>
  )
}

export function PriceForm({ serviceId, variantId, price }: { serviceId: string; variantId: string; price: number }) {
  const [state, action, working] = useActionState<FormState, FormData>(updateService, {})
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="service_id" value={serviceId} />
      <input type="hidden" name="variant_id" value={variantId} />
      <input className="field w-28" name="price" type="number" min={0} step="0.01" defaultValue={price} aria-label="Price" />
      <button className="btn-secondary" type="submit" disabled={working}>
        Save
      </button>
      {state.error ? (
        <span className="text-xs text-ui-tag-red-text">{state.error}</span>
      ) : state.info ? (
        <span className="text-xs text-ui-fg-subtle">{state.info}</span>
      ) : null}
    </form>
  )
}
