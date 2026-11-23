import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Label, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"

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
  invite_code: string
}

type Draft = { domain?: string; rate?: string }

const STATUS_COLOR: Record<Status, "green" | "orange" | "red"> = {
  active: "green",
  pending: "orange",
  suspended: "red",
}
const STATUS_ORDER: Record<Status, number> = { pending: 0, active: 1, suspended: 2 }

const errorText = (e: unknown) =>
  (e as { message?: string })?.message ?? "Something went wrong."

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

const SellersPage = () => {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [invite, setInvite] = useState(EMPTY_INVITE)
  const [invited, setInvited] = useState<{ name: string; code: string } | null>(null)

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
      refresh()
    },
    onError: (e) => toast.error(errorText(e)),
  })

  const sellers = [...(data?.sellers ?? [])].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name)
  )
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
          className="grid grid-cols-1 items-end gap-2 md:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <div className="flex flex-col gap-1">
            <Label size="small" htmlFor="invite-name">Name</Label>
            <Input
              id="invite-name"
              size="small"
              placeholder="Lina Shop"
              value={invite.name}
              onChange={(e) => setInvite((i) => ({ ...i, name: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label size="small" htmlFor="invite-handle">Shop address</Label>
            <Input
              id="invite-handle"
              size="small"
              placeholder="lina-shop"
              value={invite.handle}
              onChange={(e) => setInvite((i) => ({ ...i, handle: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label size="small" htmlFor="invite-email">Email (their sign-in)</Label>
            <Input
              id="invite-email"
              size="small"
              type="email"
              placeholder="lina@example.com"
              value={invite.email}
              onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label size="small" htmlFor="invite-domain">Domain (optional)</Label>
            <Input
              id="invite-domain"
              size="small"
              placeholder="shop.example.com"
              value={invite.domain}
              onChange={(e) => setInvite((i) => ({ ...i, domain: e.target.value }))}
            />
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
              value={invite.rate}
              onChange={(e) => setInvite((i) => ({ ...i, rate: e.target.value }))}
            />
          </div>
          <Button
            size="small"
            type="submit"
            disabled={!invite.name.trim() || !invite.handle.trim() || !invite.email.trim() || rateValue(invite.rate) === undefined}
            isLoading={create.isPending}
          >
            Invite
          </Button>
        </form>
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
                      <Badge size="2xsmall" color={STATUS_COLOR[s.status]}>{s.status}</Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Input
                        size="small"
                        className="w-48"
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
                      <Button size="small" variant="transparent" className="font-mono" onClick={() => copy(s.invite_code, "Invite code")}>
                        {s.invite_code}
                      </Button>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {s.status !== "active" && (
                        <Button
                          size="small"
                          disabled={!!busyId}
                          isLoading={busy && update.variables?.body.status === "active"}
                          onClick={() =>
                            update.mutate({ id: s.id, body: { status: "active" }, done: `${s.name} ${s.status === "pending" ? "activated" : "reactivated"}` })
                          }
                        >
                          {s.status === "pending" ? "Activate" : "Reactivate"}
                        </Button>
                      )}
                      {s.status !== "suspended" && (
                        <Button
                          size="small"
                          variant="danger"
                          className="ml-2"
                          disabled={!!busyId}
                          isLoading={busy && update.variables?.body.status === "suspended"}
                          onClick={() => suspend(s)}
                        >
                          Suspend
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="secondary"
                        className="ml-2"
                        disabled={resetLink.isPending}
                        isLoading={resetLink.isPending && resetLink.variables?.path.includes(s.id)}
                        onClick={() => resetLink.mutate({ path: `/admin/sellers/${s.id}/reset-link`, who: s.name })}
                      >
                        Reset link
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
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
  label: "Sellers",
})

export default SellersPage
