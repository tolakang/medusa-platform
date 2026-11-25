"use client"

import { useActionState, useState } from "react"
import { saveProducts, type SaveState } from "./actions"

type Product = { id: string; title: string; handle: string; thumbnail: string | null; selected: boolean }

// TASKS P5-08: tick the products to show in your shop, then save.
export function ProductForm({ products }: { products: Product[] }) {
  const [state, action, saving] = useActionState<SaveState, FormData>(saveProducts, {})
  // The ticks are held here, not in the boxes: React resets a form after its
  // action, so a failed save put the boxes back to the saved selection while
  // the count kept the unsaved one. The Save bar stays in view with the count.
  const [picked, setPicked] = useState(() => new Set(products.filter((p) => p.selected).map((p) => p.id)))
  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  return (
    <form action={action} className="card flex flex-col gap-3 p-4">
      {products.length === 0 && (
        <p className="text-sm text-ui-fg-subtle">The shop has no published products yet.</p>
      )}
      <ul className="flex flex-col divide-y divide-ui-border-base">
        {products.map((product) => (
          <li key={product.id} className="flex items-center gap-3 py-2">
            {product.selected && <input type="hidden" name="current" value={product.id} />}
            <input
              id={`p-${product.id}`}
              type="checkbox"
              name="selected"
              value={product.id}
              checked={picked.has(product.id)}
              onChange={(e) => toggle(product.id, e.target.checked)}
              className="h-4 w-4"
            />
            {product.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.thumbnail} alt="" className="h-10 w-10 rounded object-cover" />
            ) : (
              <span className="h-10 w-10 rounded bg-ui-bg-component" />
            )}
            <label htmlFor={`p-${product.id}`} className="flex-1 text-sm">
              {product.title}
              <span className="block text-xs text-ui-fg-subtle">{product.handle}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col gap-2 border-t border-ui-border-base bg-ui-bg-base p-4">
        {state.error && (
          <p role="alert" className="rounded-lg bg-ui-tag-red-bg px-3 py-2 text-sm text-ui-tag-red-text">
            {state.error}
          </p>
        )}
        {state.saved && !state.error && (
          <p role="status" className="rounded-lg bg-ui-tag-green-bg px-3 py-2 text-sm text-ui-tag-green-text">Saved.</p>
        )}
        <div className="flex items-center gap-3">
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <span className="text-sm text-ui-fg-subtle">
            {picked.size} of {products.length} ticked
          </span>
        </div>
      </div>
    </form>
  )
}
