import { defineRouteConfig } from "@medusajs/admin-sdk"
import { EllipsisHorizontal, Users } from "@medusajs/icons"
import { Badge, Button, Container, DropdownMenu, Heading, IconButton, Input, Label, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import { errorText, SELLER_STATUS_LABEL } from "../../lib/ui"

const PAGE_SIZE = 50

// Sellers (TASKS F-081, BUILD_PLAN §9.5): invite a seller, give them their
// invite code, activate or suspend them, and set their domain and commission
// rate. Reads GET /admin/sellers; writes POST /admin/sellers (P5-03) and
// POST /admin/sellers/:id (F-081).

type Status = "pending" | "active" | "suspended"

type Seller = {
  id: string
  handle: string
  name: string
  email: string
  domain: string | null
  status: Status
  commission_rate: number | null
  created_at: string
  // Null once the seller accepted and set a password (the code is spent).
  invite_code: string | null
  accepted_at: string | null
  payout_hold?: boolean
}

type Draft = { domain?: string; rate?: string }

const STATUS_COLOR: Record<Status, "green" | "orange" | "red"> = {
  active: "green",
  pending: "orange",
  suspended: "red",
}


/** "" = none (domain) or the shop's default (rate). */
const changes = (seller: Seller, draft: Draft) => {
  const body: Record<string, unknown> = {}
  if (draft.domain !== undefined) {
    const domain = draft.domain.trim().toLowerCase()
    body.domain = domain === "" ? null : domain
  }
  if (draft.rate !== undefined) body.commission_rate = rateValue(draft.rate)
  if (body.domain === seller.domain) delete body.domain
  if (body.commission_rate === seller.commission_rate) delete body.commission_rate
  return body
}

/** "" = the shop's default; otherwise 0 to 100; undefined = not a valid rate. */
const rateValue = (raw: string) => {
  const t = raw.trim()
  if (t === "") return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined
}

const copy = (text: string, what: string) =>
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${what} copied`),
    () => toast.error("Couldn't copy. Select it and copy by hand.")
  )

const EMPTY_INVITE = { name: "", handle: "", email: "", domain: "", rate: "" }
type InviteField = keyof typeof EMPTY_INVITE

/** A shop address from the name: "Lina's Shop" → "linas-shop". */
const handleFrom = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)

const HANDLE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

/** What is wrong with each field of the invite form, in plain words. */
const inviteErrors = (i: typeof EMPTY_INVITE) => {
  const errors: Partial<Record<InviteField, string>> = {}
  if (!i.name.trim()) errors.name = "Give the seller's shop a name."
  if (!i.handle.trim()) errors.handle = "Give the shop an address."
  else if (!HANDLE_RE.test(i.handle.trim())) errors.handle = "Use lowercase letters, digits and single hyphens, such as lina-shop."
  if (!i.email.trim()) errors.email = "Enter the email the seller signs in with."
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email.trim())) errors.email = "This doesn't look like an email address."
  if (i.domain.trim() && !DOMAIN_RE.test(i.domain.trim().toLowerCase()))
    errors.domain = "Use a host name such as shop.example.com, without https://."
  if (rateValue(i.rate) === undefined) errors.rate = "Use a percent from 0 to 100, or leave it empty for the default."
  return errors
}

/** Puts a server message under the field it is about. */
const fieldOf = (message: string): InviteField | null => {
  const m = message.toLowerCase()
  if (m.includes("domain")) return "domain"
  if (m.includes("handle") || m.includes("address") || m.includes("hyphen")) return "handle"
  if (m.includes("email")) return "email"
  if (m.includes("commission") || m.includes("rate")) return "rate"
  if (m.includes("name")) return "name"
  return null
}

function FieldError({ id, text }: { id: string; text?: string }) {
  return text ? (
    <Text id={id} size="xsmall" className="text-ui-fg-error" role="alert">
      {text}
    </Text>
  ) : null
}

const SellersPage = () => {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [invite, setInvite] = useState(EMPTY_INVITE)
  const [invited, setInvited] = useState<{ name: string; code: string } | null>(null)
  // Errors show once a field was left or the form was sent, not while typing.
  const [touched, setTouched] = useState<Partial<Record<InviteField, boolean>>>({})
  const [serverError, setServerError] = useState<{ field: InviteField | null; text: string } | null>(null)
  const [handleEdited, setHandleEdited] = useState(false)

  // A page at a time (design critique, 2026-11-23); back to the first page
  // when the filter changes.
  const [page, setPage] = useState(0)
  const { data, isLoading, error } = useQuery({
    queryKey: ["reseller-sellers", page],
    queryFn: () =>
      sdk.client.fetch<{ sellers: Seller[]; count: number }>("/admin/sellers", {
        query: { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      }),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["reseller-sellers"] })

  const prompt = usePrompt()
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown>; done: string }) =>
      sdk.client.fetch(`/admin/sellers/${id}`, { method: "POST", body }),
    onSuccess: (_, { id, done }) => {
      toast.success(done)
      setDrafts((d) => {
        const { [id]: _done, ...rest } = d
        return rest
      })
      refresh()
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const busyId = update.isPending ? update.variables?.id : undefined
  // A one-time "set a new password" link to send by chat when the reset email
  // doesn't reach them (design critique, 2026-11-23).
  const resetLink = useMutation({
    mutationFn: ({ path }: { path: string; who: string }) =>
      sdk.client.fetch<{ link: string; expires_in_minutes: number }>(path, { method: "POST" }),
    onSuccess: async ({ link, expires_in_minutes }, { who }) => {
      const copied = await navigator.clipboard.writeText(link).then(
        () => true,
        () => false
      )
      toast.success(copied ? `Reset link for ${who} copied` : `Reset link for ${who}`, {
        description: copied ? `Send it to them. It works for ${expires_in_minutes} minutes.` : link,
        duration: copied ? 8000 : 60000,
      })
    },
    onError: (e) => toast.error(errorText(e)),
  })
  // Suspending signs the seller out at once, so it asks first.
  const suspend = async (s: Seller) => {
    const ok = await prompt({
      title: `Suspend ${s.name}?`,
      description: "Their shop stops showing, their orders stop earning commission and they're signed out of the seller portal at once. You can reactivate them later.",
      variant: "danger",
      confirmText: "Suspend",
      cancelText: "Back",
    })
    if (ok) update.mutate({ id: s.id, body: { status: "suspended" }, done: `${s.name} suspended` })
  }

  const create = useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ seller: Seller; invite_code: string }>("/admin/sellers", {
        method: "POST",
        body: {
          name: invite.name.trim(),
          handle: invite.handle.trim(),
          email: invite.email.trim(),
          domain: invite.domain.trim() === "" ? null : invite.domain.trim().toLowerCase(),
          commission_rate: rateValue(invite.rate),
          status: "active",
        },
      }),
    onSuccess: ({ seller, invite_code }) => {
      toast.success(`${seller.name} invited`)
      setInvited({ name: seller.name, code: invite_code })
      setInvite(EMPTY_INVITE)
      setTouched({})
      setHandleEdited(false)
      setServerError(null)
      refresh()
    },
    onError: (e) => {
      const text = errorText(e)
      setServerError({ field: fieldOf(text), text })
    },
  })
  const errors = inviteErrors(invite)
  const errorFor = (f: InviteField) =>
    (touched[f] ? errors[f] : undefined) ?? (serverError?.field === f ? serverError.text : undefined)
  const setField = (f: InviteField, value: string) => {
    if (serverError?.field === f) setServerError(null)
    setInvite((i) => {
      const next = { ...i, [f]: value }
      // The address follows the name until it is edited by hand.
      if (f === "name" && !handleEdited) next.handle = handleFrom(value)
      return next
    })
  }
  const fieldProps = (f: InviteField) => ({
    value: invite[f],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setField(f, e.target.value),
    onBlur: () => setTouched((t) => ({ ...t, [f]: true })),
    "aria-invalid": !!errorFor(f),
    "aria-describedby": errorFor(f) ? `invite-${f}-error` : undefined,
  })

  // Newest first, as the server pages them (a sort here would only reorder one page).
  const sellers = data?.sellers ?? []
  const setDraft = (id: string, patch: Draft) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex flex-col gap-y-4">
        <div>
          <Heading>Invite a seller</Heading>
          <Text className="text-ui-fg-subtle">
            The seller is active at once. Give them the invite code: they set their password with
            it in the seller portal. Their shop's domain (such as shop.example.com) also has to be
            allowed by your developer before it works. Leave commission empty for the shop's
            default rate.
          </Text>
        </div>
        <form
          className="grid grid-cols-1 items-start gap-2 md:grid-cols-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setTouched({ name: true, handle: true, email: true, domain: true, rate: true })
            if (Object.keys(errors).length === 0) create.mutate()
          }}
        >
          <div className="flex flex-col gap-1">
            <Label size="small" htmlFor="invite-name">Name</Label>
            <Input
              id="invite-name"
              size="small"
              placeholder="Lina Shop"
              {...fieldProps("name")}
            />
            <FieldError id="invite-name-error" text={errorFor("name")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label size="small" htmlFor="invite-handle">Shop address</Label>
            <Input
              id="invite-handle"
              size="small"
              placeholder="lina-shop"
              {...fieldProps("handle")}
              onChange={(e) => {
                setHandleEdited(true)
                setField("handle", e.target.value)
              }}
            />
            <FieldError id="invite-handle-error" text={errorFor("handle")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label size="small" htmlFor="invite-email">Email (their sign-in)</Label>
            <Input
              id="invite-email"
              size="small"
              type="email"
              placeholder="lina@example.com"
              {...fieldProps("email")}
            />
            <FieldError id="invite-email-error" text={errorFor("email")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label size="small" htmlFor="invite-domain">Domain (optional)</Label>
            <Input
              id="invite-domain"
              size="small"
              placeholder="shop.example.com"
              {...fieldProps("domain")}
            />
            <FieldError id="invite-domain-error" text={errorFor("domain")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label size="small" htmlFor="invite-rate">Commission % (optional)</Label>
            <Input
              id="invite-rate"
              size="small"
              type="number"
              min={0}
              max={100}
              step="0.1"
              placeholder="default"
              {...fieldProps("rate")}
            />
            <FieldError id="invite-rate-error" text={errorFor("rate")} />
          </div>
          <div className="flex flex-col gap-1 md:pt-5">
            <Button size="small" type="submit" isLoading={create.isPending}>
              Invite
            </Button>
          </div>
        </form>
        {serverError && !serverError.field && (
          <Text size="small" className="text-ui-fg-error" role="alert">
            {serverError.text}
          </Text>
        )}
        {invited && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-ui-border-base bg-ui-bg-subtle px-3 py-2">
            <Text>
              {invited.name} is invited. Invite code:{" "}
              <span className="font-mono font-semibold">{invited.code}</span>
            </Text>
            <Button size="small" variant="secondary" type="button" onClick={() => copy(invited.code, "Invite code")}>
              Copy code
            </Button>
            <Button size="small" variant="transparent" type="button" onClick={() => setInvited(null)}>
              Done
            </Button>
          </div>
        )}
      </Container>

      <Container className="flex flex-col gap-y-4">
        <div>
          <Heading>Sellers</Heading>
          <Text className="text-ui-fg-subtle">
            Only an active seller's domain shows their shop, and only their orders earn a
            commission. Suspending signs the seller out at once. A new rate applies to new orders.
          </Text>
        </div>
        {error && <Text className="text-ui-fg-error">{errorText(error)}</Text>}
        {isLoading ? (
          <Text>Loading…</Text>
        ) : !sellers.length ? (
          <Text className="text-ui-fg-subtle">No sellers yet.</Text>
        ) : (
          <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Seller</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Domain</Table.HeaderCell>
                <Table.HeaderCell>Commission %</Table.HeaderCell>
                <Table.HeaderCell>Invite code</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {sellers.map((s) => {
                const draft = drafts[s.id] ?? {}
                const body = changes(s, draft)
                const busy = busyId === s.id
                const badRate = draft.rate !== undefined && rateValue(draft.rate) === undefined
                return (
                  <Table.Row key={s.id}>
                    <Table.Cell>
                      <div className="flex flex-col">
                        <Text size="small" weight="plus">{s.name}</Text>
                        <Text size="small" className="text-ui-fg-subtle">
                          {s.email} · shop address: {s.handle}
                        </Text>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-wrap gap-1">
                        <Badge size="2xsmall" color={STATUS_COLOR[s.status]}>{SELLER_STATUS_LABEL[s.status] ?? s.status}</Badge>
                        {/* Until the seller sets a password with the invite code. */}
                        {!s.accepted_at && <Badge size="2xsmall" color="blue">Invited</Badge>}
                        {s.payout_hold && <Badge size="2xsmall" color="orange">Payouts held</Badge>}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Input
                        size="small"
                        className="w-40"
                        placeholder="none"
                        aria-label={`Domain for ${s.name}`}
                        value={draft.domain ?? s.domain ?? ""}
                        onChange={(e) => setDraft(s.id, { domain: e.target.value })}
                      />
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-2">
                        <Input
                          size="small"
                          type="number"
                          min={0}
                          max={100}
                          step="0.1"
                          className="w-24"
                          placeholder="default"
                          aria-label={`Commission % for ${s.name}`}
                          aria-invalid={badRate}
                          value={draft.rate ?? (s.commission_rate === null ? "" : String(s.commission_rate))}
                          onChange={(e) => setDraft(s.id, { rate: e.target.value })}
                        />
                        {Object.keys(body).length > 0 && (
                          <Button
                            size="small"
                            variant="secondary"
                            disabled={!!busyId || badRate}
                            isLoading={busy && update.variables?.body.status === undefined}
                            onClick={() => update.mutate({ id: s.id, body, done: `${s.name} saved` })}
                          >
                            Save
                          </Button>
                        )}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      {/* Hidden in the table; Copy hands it over (design critique, 2026-11-23). */}
                      {s.invite_code ? (
                        <div className="flex items-center gap-x-2">
                          <span className="font-mono">••••{s.invite_code.slice(-4)}</span>
                          <Button size="small" variant="transparent" onClick={() => copy(s.invite_code!, "Invite code")}>
                            Copy
                          </Button>
                        </div>
                      ) : (
                        <Text size="small" className="text-ui-fg-subtle">Used</Text>
                      )}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {/* One menu, so the row fits narrow screens (design review, 2026-11-25). */}
                      <DropdownMenu>
                        <DropdownMenu.Trigger asChild>
                          <IconButton
                            size="small"
                            variant="transparent"
                            aria-label={`Actions for ${s.name}`}
                            disabled={!!busyId || resetLink.isPending}
                          >
                            <EllipsisHorizontal />
                          </IconButton>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content align="end">
                          {s.status !== "active" && (
                            <DropdownMenu.Item
                              onClick={() =>
                                update.mutate({ id: s.id, body: { status: "active" }, done: `${s.name} ${s.status === "pending" ? "activated" : "reactivated"}` })
                              }
                            >
                              {s.status === "pending" ? "Activate" : "Reactivate"}
                            </DropdownMenu.Item>
                          )}
                          <DropdownMenu.Item
                            onClick={() => resetLink.mutate({ path: `/admin/sellers/${s.id}/reset-link`, who: s.name })}
                          >
                            Copy password reset link
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            onClick={() =>
                              update.mutate({
                                id: s.id,
                                body: { payout_hold: !s.payout_hold },
                                done: s.payout_hold ? `${s.name}'s payouts released` : `${s.name}'s payouts held`,
                              })
                            }
                          >
                            {s.payout_hold ? "Release payouts" : "Hold payouts"}
                          </DropdownMenu.Item>
                          {s.status !== "suspended" && (
                            <>
                              <DropdownMenu.Separator />
                              <DropdownMenu.Item className="text-ui-fg-error" onClick={() => suspend(s)}>
                                Suspend
                              </DropdownMenu.Item>
                            </>
                          )}
                        </DropdownMenu.Content>
                      </DropdownMenu>
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
          </div>
        )}
          {(data?.count ?? 0) > PAGE_SIZE && (
            <Table.Pagination
              count={data?.count ?? 0}
              pageSize={PAGE_SIZE}
              pageIndex={page}
              pageCount={Math.ceil((data?.count ?? 0) / PAGE_SIZE)}
              canPreviousPage={page > 0}
              canNextPage={(page + 1) * PAGE_SIZE < (data?.count ?? 0)}
              previousPage={() => setPage((p) => p - 1)}
              nextPage={() => setPage((p) => p + 1)}
            />
          )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Sellers", icon: Users,
})

export default SellersPage
