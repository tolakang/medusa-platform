"use client"

import { useActionState, useState } from "react"
import { money } from "@/lib/format"
import { saveProducts, type SaveState } from "./actions"

type Product = { id: string; title: string; handle: string; thumbnail: string | null; price?: { amount: number; currency_code: string } | null; selected: boolean }

// TASKS P5-08: tick the products to show in your shop, then save.
export function ProductForm({ products }: { products: Product[] }) {
  const [state, action, saving] = useActionState<SaveState, FormData>(saveProducts, {})
  // The ticks are held here, not in the boxes: React resets a form after its
  // action, so a failed save put the boxes back to the saved selection while
  // the count kept the unsaved one. The Save bar stays in view with the count.
  const [picked, setPicked] = useState(() => new Set(products.filter((p) => p.selected).map((p) => p.id)))
  // Search over a long list (ui-compare, 2026-11-25). Rows that don't match are
  // hidden, not removed, so their ticks are still sent on Save.
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const matches = (p: Product) => !q || p.title.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q)
  const visible = products.filter(matches)
  const shown = visible.length
  const allVisiblePicked = shown > 0 && visible.every((p) => picked.has(p.id))
  // Ticks or unticks every product the search shows (role test 2026-11-25).
  const toggleVisible = (on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev)
      for (const p of visible) {
        if (on) next.add(p.id)
        else next.delete(p.id)
      }
      return next
    })
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
      {products.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="sr-only">Search products</span>
          <input
            className="field"
            type="search"
            placeholder="Search products"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault()
            }}
          />
        </label>
      )}
      {shown > 0 && (
        <label className="flex items-center gap-3 border-b border-ui-border-base pb-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={allVisiblePicked}
            onChange={(e) => toggleVisible(e.target.checked)}
          />
          {q ? `Select all ${shown} shown` : `Select all ${shown}`}
        </label>
      )}
      {q && shown === 0 && <p className="text-sm text-ui-fg-subtle">No products match “{query.trim()}”.</p>}
      <ul className="flex flex-col divide-y divide-ui-border-base">
        {products.map((product) => (
          <li key={product.id} className={`${matches(product) ? "flex" : "hidden"} items-center gap-3 py-2`}>
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
            <span className="text-sm tabular-nums">
              {product.price ? `${product.price.amount > 0 ? "from " : ""}${money(product.price.amount, product.price.currency_code)}` : "—"}
            </span>
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
