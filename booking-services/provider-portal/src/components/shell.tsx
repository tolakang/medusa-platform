import Link from "next/link"
import { logout } from "@/app/login/actions"
import type { Provider } from "@/lib/server/provider"

// TASKS P3-32: header and navigation of every portal page. One portal, two
// roles: staff see their calendar and profile; partners also their hours,
// days off, services and event packages.
const LINKS = [
  { href: "/", label: "Calendar", partner: false },
  { href: "/hours", label: "Hours and days off", partner: true },
  { href: "/services", label: "Services", partner: true },
  { href: "/packages", label: "Packages", partner: true },
  { href: "/earnings", label: "Earnings", partner: true },
  { href: "/profile", label: "Profile", partner: false },
]

export function Shell({
  provider,
  active,
  children,
}: {
  provider: Provider
  active: string
  children: React.ReactNode
}) {
  const links = LINKS.filter((l) => !l.partner || provider.role === "partner")
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ui-fg-subtle">Provider portal · {provider.role === "partner" ? "Partner" : "Staff"}</p>
          <h1 className="text-xl font-semibold">{provider.name}</h1>
        </div>
        <form action={logout}>
          <button className="btn-secondary" type="submit">
            Sign out
          </button>
        </form>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label="Portal">
        {links.map((link) => (
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
      {provider.status === "pending" ? (
        <p className="card px-4 py-3 text-sm">
          Your account is waiting for the shop&apos;s approval. You can set your hours and add services once it is
          approved.
        </p>
      ) : (
        <main className="flex flex-col gap-6">{children}</main>
      )}
    </div>
  )
}
