import Link from "next/link"
import { notFound } from "next/navigation"
import { Shell } from "@/components/shell"
import { requireVendor, vendorGet } from "@/lib/server/vendor"
import { EditProductForm } from "./edit-form"

type Product = {
  id: string
  title: string
  description: string | null
  status: "draft" | "proposed" | "published" | "rejected"
  metadata: Record<string, unknown> | null
  variants?: { sku: string | null; prices?: { amount: number; currency_code: string }[] }[]
}

// Fix a draft or rejected product and send it for review (gap review
// 2026-11-24). A product on sale is the marketplace's to change.
export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token, vendor } = await requireVendor()
  if (vendor.status !== "active") {
    return <Shell vendor={vendor} active="/products">{null}</Shell>
  }
  const { products, approval_required, currencies } = await vendorGet<{
    products: Product[]
    approval_required?: boolean
    currencies?: string[]
  }>(
    token,
    "/vendors/products"
  )
  const product = products.find((p) => p.id === id)
  if (!product) notFound()
  const note = typeof product.metadata?.rejection_note === "string" ? product.metadata.rejection_note : null
  return (
    <Shell vendor={vendor} active="/products">
      <Link href="/products" className="text-sm text-ui-fg-interactive">
        ← All products
      </Link>
      {product.status === "rejected" && (
        <p role="status" className="card border-ui-tag-red-border bg-ui-tag-red-bg p-4 text-sm text-ui-tag-red-text">
          The marketplace rejected this product{note ? `: ${note}` : "."} Fix it below and send it for review again.
        </p>
      )}
      {/* A product on sale can be edited too (bug 2026-11-25); with approval
          required the edit goes back to review. */}
      <EditProductForm
        product={{
          ...product,
          price: product.variants?.[0]?.prices?.[0] ?? null,
          sku: product.variants?.[0]?.sku ?? null,
        }}
        approvalRequired={approval_required !== false}
        currencies={currencies ?? []}
      />
    </Shell>
  )
}
