import Link from "next/link"
import { logout } from "@/app/login/actions"
import type { Vendor } from "@/lib/server/vendor"

// TASKS P6-09: header and navigation of every portal page.
const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/products", label: "Products" },
  { href: "/orders", label: "Orders" },
  { href: "/payouts", label: "Payouts" },
  { href: "/settings", label: "Shop settings" },
]

export function Shell({
  vendor,
  active,
  children,
}: {
  vendor: Vendor
  active: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ui-fg-subtle">Vendor portal</p>
          <h1 className="text-xl font-semibold">{vendor.name}</h1>
        </div>
        <form action={logout}>
          <button className="btn-secondary" type="submit">
            Sign out
          </button>
        </form>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label="Portal">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active === link.href ? "page" : undefined}
            className={active === link.href ? "btn-primary" : "btn-secondary"}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <main className="flex flex-col gap-6">{vendor.status === "active" ? children : <NotActive vendor={vendor} />}</main>
    </div>
  )
}

// A pending or suspended shop sees what's happening and what comes next on
// every tab (design critique, 2026-11-23), not an empty page.
function NotActive({ vendor }: { vendor: Vendor }) {
  const pending = vendor.status === "pending"
  return (
    <section role="status" className="card flex flex-col gap-3 p-6">
      <h2 className="text-lg font-semibold">{pending ? "Your shop is being reviewed" : "Your shop is paused"}</h2>
      <p className="text-ui-fg-subtle">
        {pending
          ? "The marketplace checks every new shop, usually within 1–2 working days. We email you when it's approved."
          : "The marketplace has paused your shop, so your products aren't for sale right now. Contact the marketplace to find out why."}
      </p>
      {pending && (
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
          <li className="text-ui-fg-subtle">Shop created ✓</li>
          <li className="font-medium">Marketplace review (now)</li>
          <li className="text-ui-fg-subtle">Add products, take orders, get paid</li>
        </ol>
      )}
    </section>
  )
}

export function Pager({ path, page, count, limit, extra = "" }: {
  path: string
  page: number
  count: number
  limit: number
  extra?: string
}) {
  const last = Math.max(1, Math.ceil(count / limit))
  return (
    <div className="flex items-center justify-between text-sm text-ui-fg-subtle">
      <span>
        Page {Math.min(page, last)} of {last} · {count} in all
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link className="btn-secondary" href={`${path}?page=${page - 1}${extra}`}>
            Previous
          </Link>
        )}
        {page < last && (
          <Link className="btn-secondary" href={`${path}?page=${page + 1}${extra}`}>
            Next
          </Link>
        )}
      </span>
    </div>
  )
}
