import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Users } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Label, Select, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import { usePageTitle } from "../../lib/page-title"

// Providers (TASKS P3-31, BUILD_PLAN §9.3 "Providers"): invite staff for a
// staff resource and give them the invite code, approve or suspend partners,
// set a partner's commission rate. Reads and writes /admin/booking/providers.

type Provider = {
  id: string
  role: "staff" | "partner"
  status: "invited" | "pending" | "active" | "suspended"
  email: string
  name: string
  handle: string
  commission_rate: number | null
  status_reason?: string | null
  invite_code?: string
  resources?: { id: string; name: string; type: string }[]
}
type Resource = { id: string; name: string; type: string; provider_id?: string | null }

const QUERY_KEY = ["booking-providers"]

// The message staff need to join, ready to paste into chat or SMS (staging
// review, 2026-11-23: the code was only in a toast that disappeared).
const inviteMessage = (p: Pick<Provider, "name" | "email" | "invite_code">, portal: string | null) =>
  [
    `Hi ${p.name}, you're invited to the provider portal.`,
    `1. Open ${portal ?? "the provider portal"} and choose "I have an invite code".`,
    `2. Enter this email: ${p.email}`,
    `3. Enter the invite code: ${p.invite_code}`,
    `4. Choose a password of at least 8 characters, then confirm your email from the message we send you.`,
  ].join("\n")

const copy = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
  } catch {
    toast.error(`Couldn't copy. Select the ${what.toLowerCase()} and copy it by hand.`)
  }
}

// Shown after inviting, until closed: the code and the message to send.
const InviteReady = ({ provider, portal, onClose }: { provider: Provider; portal: string | null; onClose: () => void }) => (
  <div className="flex flex-col gap-y-3 px-6 py-4" data-testid="invite-ready">
    <div className="flex items-start justify-between gap-3">
      <div>
        <Text weight="plus">{provider.name} is invited</Text>
        <Text size="small" className="text-ui-fg-subtle">
          Send them this message. The code works only with {provider.email}.
        </Text>
      </div>
      <Button size="small" variant="transparent" onClick={onClose}>
        Close
      </Button>
    </div>
    <pre className="whitespace-pre-wrap rounded-md border border-ui-border-base bg-ui-bg-subtle p-3 text-sm">
      {inviteMessage(provider, portal)}
    </pre>
    <div className="flex flex-wrap gap-2">
      <Button size="small" onClick={() => copy(inviteMessage(provider, portal), "Message")}>
        Copy message
      </Button>
      <Button size="small" variant="secondary" onClick={() => copy(provider.invite_code ?? "", "Code")}>
        Copy code {provider.invite_code}
      </Button>
    </div>
    {!portal && (
      <Text size="xsmall" className="text-ui-fg-error">
        The portal address isn't set on the backend (PROVIDER_PORTAL_URL): add it so the message has the link.
      </Text>
    )}
  </div>
)
const NEW_RESOURCE = "new"

const STATUS: Record<Provider["status"], { label: string; color: "green" | "orange" | "grey" | "red" }> = {
  invited: { label: "Invited", color: "orange" },
  pending: { label: "Waiting for approval", color: "orange" },
  active: { label: "Active", color: "green" },
  suspended: { label: "Suspended", color: "red" },
}

const ProvidersPage = () => {
  usePageTitle("Providers")
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name: "", email: "", resource_id: NEW_RESOURCE })
  const [rate, setRate] = useState<{ id: string; value: string } | null>(null)
  const [invited, setInvited] = useState<Provider | null>(null)
  const [resetLink, setResetLink] = useState<{ id: string; link: string } | null>(null)
  // Declining a pending partner asks why (kept with the provider).
  const [declining, setDeclining] = useState<{ id: string; reason: string } | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => sdk.client.fetch<{ providers: Provider[]; portal_url: string | null }>("/admin/booking/providers"),
  })
  const providers = data?.providers ?? []
  const portal = data?.portal_url ?? null
  const { data: resourceData } = useQuery({
    queryKey: ["booking-resources-for-providers"],
    queryFn: () => sdk.client.fetch<{ resources: Resource[] }>("/admin/booking/resources"),
  })
  // Staff resources nobody signs in for yet.
  const owned = new Set(providers.flatMap((p) => (p.resources ?? []).map((r) => r.id)))
  const freeStaff = (resourceData?.resources ?? []).filter((r) => r.type === "staff" && !owned.has(r.id))

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    queryClient.invalidateQueries({ queryKey: ["booking-resources-for-providers"] })
  }

  const invite = useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ provider: Provider }>("/admin/booking/providers", {
        method: "POST",
        body: {
          name: form.name.trim(),
          email: form.email.trim(),
          ...(form.resource_id !== NEW_RESOURCE ? { resource_id: form.resource_id } : {}),
        },
      }),
    onSuccess: ({ provider }) => {
      setForm({ name: "", email: "", resource_id: NEW_RESOURCE })
      refresh()
      setInvited(provider)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const prompt = usePrompt()
  const update = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      status?: "active" | "suspended"
      status_reason?: string
      commission_rate?: number | null
    }) =>
      sdk.client.fetch<{ provider: Provider }>(`/admin/booking/providers/${id}`, { method: "POST", body }),
    onSuccess: ({ provider }) => {
      setRate(null)
      setDeclining(null)
      refresh()
      toast.success(`${provider.name} saved`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // A one-time link to set a new password, for someone who can't sign in
  // and doesn't get the reset email.
  const reset = useMutation({
    mutationFn: (id: string) => sdk.client.fetch<{ link: string }>(`/admin/booking/providers/${id}/reset-link`, { method: "POST" }),
    onSuccess: ({ link }, id) => {
      setResetLink({ id, link })
      copy(link, "Reset link")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const canInvite = !!form.name.trim() && /\S+@\S+\.\S+/.test(form.email.trim())
  const rateValue = rate ? (rate.value.trim() === "" ? null : Number(rate.value)) : undefined
  const rateValid = rateValue === null || (typeof rateValue === "number" && Number.isFinite(rateValue) && rateValue >= 0 && rateValue <= 100)

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Providers</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Invite staff for their calendar, then send them the message with their code. Partners sign up in the portal
            on their own and stay hidden from the shop until you approve them. Someone who can't sign in: use Reset
            link and send it to them.
          </Text>
        </div>
        <form
          className="flex flex-wrap items-end gap-3 px-6 py-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (canInvite) invite.mutate()
          }}
        >
          <div className="flex flex-col gap-y-1">
            <Label size="small" htmlFor="staff-name">
              Name
            </Label>
            <Input id="staff-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small" htmlFor="staff-email">
              Email
            </Label>
            <Input
              id="staff-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small">Calendar</Label>
            <Select value={form.resource_id} onValueChange={(v) => setForm({ ...form, resource_id: v })}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={NEW_RESOURCE}>New staff calendar</Select.Item>
                {freeStaff.map((r) => (
                  <Select.Item key={r.id} value={r.id}>
                    {r.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <Button type="submit" size="small" disabled={!canInvite} isLoading={invite.isPending}>
            Invite staff
          </Button>
        </form>
        {invited && <InviteReady provider={invited} portal={portal} onClose={() => setInvited(null)} />}
      </Container>

      <Container className="divide-y p-0">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>Role</Table.HeaderCell>
              <Table.HeaderCell>Email</Table.HeaderCell>
              <Table.HeaderCell>Calendar</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Commission</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {providers.map((p) => (
              <Table.Row key={p.id}>
                <Table.Cell>{p.name}</Table.Cell>
                <Table.Cell>{p.role === "staff" ? "Staff" : "Partner"}</Table.Cell>
                <Table.Cell>{p.email}</Table.Cell>
                <Table.Cell>{(p.resources ?? []).map((r) => r.name).join(", ") || "-"}</Table.Cell>
                <Table.Cell>
                  <div className="flex flex-col gap-y-1">
                    <Badge size="2xsmall" color={STATUS[p.status].color}>
                      {STATUS[p.status].label}
                    </Badge>
                    {p.invite_code && <span className="font-mono text-ui-fg-subtle">{p.invite_code}</span>}
                    {p.status === "suspended" && p.status_reason && (
                      <Text size="xsmall" className="max-w-[16rem] text-ui-fg-subtle">
                        Why: {p.status_reason}
                      </Text>
                    )}
                    {resetLink?.id === p.id && (
                      <button
                        type="button"
                        className="max-w-[16rem] truncate text-left text-xs text-ui-fg-interactive"
                        title={resetLink.link}
                        onClick={() => copy(resetLink.link, "Reset link")}
                      >
                        Reset link copied (15 min). Copy again
                      </button>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  {p.role !== "partner" ? (
                    "-"
                  ) : rate?.id === p.id ? (
                    <Input
                      size="small"
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Default"
                      aria-label="Commission in percent"
                      value={rate.value}
                      onChange={(e) => setRate({ id: p.id, value: e.target.value })}
                    />
                  ) : p.commission_rate === null ? (
                    "Default"
                  ) : (
                    `${p.commission_rate}%`
                  )}
                </Table.Cell>
                <Table.Cell>
                  <div className="flex justify-end gap-x-2">
                    {rate?.id === p.id ? (
                      <>
                        <Button
                          size="small"
                          disabled={!rateValid}
                          isLoading={update.isPending}
                          onClick={() => update.mutate({ id: p.id, commission_rate: rateValue ?? null })}
                        >
                          Save
                        </Button>
                        <Button size="small" variant="secondary" onClick={() => setRate(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        {p.invite_code && (
                          <>
                            <Button size="small" variant="secondary" onClick={() => copy(p.invite_code!, "Code")}>
                              Copy code
                            </Button>
                            <Button size="small" variant="secondary" onClick={() => copy(inviteMessage(p, portal), "Message")}>
                              Copy message
                            </Button>
                          </>
                        )}
                        {p.status !== "invited" && (
                          <Button
                            size="small"
                            variant="secondary"
                            isLoading={reset.isPending && reset.variables === p.id}
                            onClick={() => reset.mutate(p.id)}
                          >
                            Reset link
                          </Button>
                        )}
                        {p.role === "partner" && (
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={() => setRate({ id: p.id, value: p.commission_rate?.toString() ?? "" })}
                          >
                            Set rate
                          </Button>
                        )}
                        {p.status === "pending" && declining?.id !== p.id && (
                          <>
                            <Button
                              size="small"
                              disabled={update.isPending}
                              onClick={() => update.mutate({ id: p.id, status: "active" })}
                            >
                              Approve
                            </Button>
                            <Button
                              size="small"
                              variant="secondary"
                              disabled={update.isPending}
                              onClick={() => setDeclining({ id: p.id, reason: "" })}
                            >
                              Decline
                            </Button>
                          </>
                        )}
                        {p.status === "pending" && declining?.id === p.id && (
                          <form
                            className="flex items-center gap-x-2"
                            onSubmit={(e) => {
                              e.preventDefault()
                              if (declining.reason.trim()) {
                                update.mutate({ id: p.id, status: "suspended", status_reason: declining.reason.trim() })
                              }
                            }}
                          >
                            <Input
                              size="small"
                              aria-label={`Why decline ${p.name}`}
                              placeholder="Why? (kept on record)"
                              maxLength={500}
                              autoFocus
                              value={declining.reason}
                              onChange={(e) => setDeclining({ id: p.id, reason: e.target.value })}
                            />
                            <Button size="small" variant="danger" type="submit" disabled={update.isPending || !declining.reason.trim()}>
                              Decline
                            </Button>
                            <Button size="small" variant="secondary" type="button" onClick={() => setDeclining(null)}>
                              Back
                            </Button>
                          </form>
                        )}
                        {p.status === "active" && (
                          <Button
                            size="small"
                            variant="secondary"
                            disabled={update.isPending}
                            onClick={async () => {
                              const ok = await prompt({
                                title: `Suspend ${p.name}?`,
                                description: "Their services leave the shop and they can't sign in to the portal. Bookings already made stay.",
                                variant: "danger",
                                confirmText: "Suspend",
                                cancelText: "Back",
                              })
                              if (ok) update.mutate({ id: p.id, status: "suspended" })
                            }}
                          >
                            Suspend
                          </Button>
                        )}
                        {p.status === "suspended" && (
                          <Button
                            size="small"
                            variant="secondary"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: p.id, status: "active" })}
                          >
                            Reactivate
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        {!isLoading && !providers.length && (
          <Text size="small" className="text-ui-fg-subtle px-6 py-4">
            {error ? `Couldn't load the providers: ${(error as Error).message}` : "No providers yet. Invite staff above."}
          </Text>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Providers", icon: Users,
})

export default ProvidersPage
