"use client"

import { useActionState, useState } from "react"
import { deleteProduct, editProduct, type EditState } from "../actions"

export function EditProductForm({
  product,
}: {
  product: { id: string; title: string; description: string | null; status: string }
}) {
  const [state, action, saving] = useActionState<EditState, FormData>(editProduct, {})
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <section className="card flex flex-col gap-4 p-4">
      <h2 className="font-semibold">Edit product</h2>
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="product_id" value={product.id} />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Name</span>
          <input className="field" name="title" required maxLength={200} defaultValue={product.title} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Description</span>
          <textarea className="field" name="description" rows={4} maxLength={5000} defaultValue={product.description ?? ""} />
        </label>
        {state.error && (
          <p role="alert" className="rounded-lg bg-ui-tag-red-bg px-3 py-2 text-sm text-ui-tag-red-text">
            {state.error}
          </p>
        )}
        {state.info && (
          <p role="status" className="rounded-lg bg-ui-tag-green-bg px-3 py-2 text-sm text-ui-tag-green-text">
            {state.info}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" type="submit" name="intent" value="propose" disabled={saving}>
            {saving ? "Saving…" : "Save and send for review"}
          </button>
          <button className="btn-secondary" type="submit" name="intent" value="draft" disabled={saving}>
            Save as draft
          </button>
        </div>
      </form>
      <form action={deleteProduct} className="flex flex-wrap items-center gap-2 border-t border-ui-border-base pt-4">
        <input type="hidden" name="product_id" value={product.id} />
        {confirmDelete ? (
          <>
            <span className="text-sm">Delete “{product.title}” for good?</span>
            <button className="btn-secondary" type="button" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
            <button className="btn-primary bg-ui-tag-red-text" type="submit">
              Yes, delete
            </button>
          </>
        ) : (
          <button className="py-2 text-sm text-ui-tag-red-text" type="button" onClick={() => setConfirmDelete(true)}>
            Delete product
          </button>
        )}
      </form>
    </section>
  )
}
