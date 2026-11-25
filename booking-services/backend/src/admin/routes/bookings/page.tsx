import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Calendar } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Label, Select, Text } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import {
  customerLabel,
  groupByLocalDay,
  shiftDate,
  STATUS_COLOR,
  timeRange,
  todayIn,
  viewDays,
  viewWindow,
  walkInTimes,
  type CalendarBooking,
  type CalendarView,
} from "../../lib/booking-calendar"
import { sdk } from "../../lib/sdk"
import { errorText, statusLabel } from "../../lib/format"


// "Asia/Phnom_Penh" → "Phnom Penh time": the zone in plain words.
const zoneLabel = (zone: string) => `${(zone.split("/").pop() ?? zone).replace(/_/g, " ")} time`

// Bookings (TASKS P3-11, BUILD_PLAN §9.3): a day or week calendar per
// resource, in the resource's own time zone, with walk-in booking and
// cancellation. Reads GET /admin/booking/resources and
// GET /admin/booking/bookings; writes POST /admin/booking/bookings (walk-in)
// and POST /admin/booking/bookings/:id/cancel (policy and refund, P3-08),
// and POST /admin/booking/bookings/:id/move (assign or move, P3-28).

type Resource = {
  id: string
  name: string
  type: string
  capacity: number
  timezone: string
  is_active: boolean
  telegram_chat_id?: string | null
  whole_days?: boolean
}


// Assign a booking to another calendar or move it to another time (TASKS
// P3-28). The time is in the chosen calendar's zone; the length stays.
const MoveForm = ({
  booking,
  resources,
  current,
  onDone,
  onClose,
}: {
  booking: CalendarBooking
  resources: Resource[]
  current: Resource
  onDone: () => void
  onClose: () => void
}) => {
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: current.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(booking.starts_at))
  const part = (t: string) => local.find((p) => p.type === t)?.value ?? ""
  const [to, setTo] = useState(current.id)
  const startDay = `${part("year")}-${part("month")}-${part("day")}`
  const startTime = `${part("hour")}:${part("minute")}`
  const [day, setDay] = useState(startDay)
  const [time, setTime] = useState(startTime)
  // Only a changed day or time is sent (review finding: a calendar in another
  // zone would otherwise shift the booking by the zones' difference).
  const timeChanged = day !== startDay || time !== startTime
  const target = resources.find((r) => r.id === to) ?? current
  const move = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/booking/bookings/${booking.id}/move`, {
        method: "POST",
        body: {
          ...(to !== current.id ? { resource_id: to } : {}),
          ...(timeChanged ? { starts_at: walkInTimes(day, time, 1, target.timezone).starts_at } : {}),
        },
      }),
    onSuccess: onDone,
  })
  return (
    <div className="mt-2 flex flex-col gap-2" data-testid="move-form">
      <Select value={to} onValueChange={setTo}>
        <Select.Trigger aria-label="Move to calendar"><Select.Value /></Select.Trigger>
        <Select.Content>
          {resources.map((r) => (
            <Select.Item key={r.id} value={r.id}>{r.name}</Select.Item>
          ))}
        </Select.Content>
      </Select>
      <div className="flex gap-2">
        <Input type="date" aria-label="New day" value={day} onChange={(e) => setDay(e.target.value)} />
        <Input type="time" aria-label="New start time" value={time} onChange={(e) => setTime(e.target.value)} />
        <Text size="xsmall" className="self-center text-ui-fg-subtle">{zoneLabel(target.timezone)}</Text>
      </div>
      <div className="flex gap-2">
        <Button size="small" isLoading={move.isPending} onClick={() => move.mutate()}>Move</Button>
        <Button size="small" variant="secondary" onClick={onClose}>Close</Button>
      </div>
      {move.error && <Text size="xsmall" className="text-ui-fg-error">{errorText(move.error)}</Text>}
    </div>
  )
}

// Where this calendar's person, driver or keeper gets their jobs on Telegram
// (TASKS P3-28): their chat ID with the staff bot; empty = the staff group.
const TelegramChat = ({ resource }: { resource: Resource }) => {
  const queryClient = useQueryClient()
  const [chat, setChat] = useState(resource.telegram_chat_id ?? "")
  useEffect(() => setChat(resource.telegram_chat_id ?? ""), [resource.id, resource.telegram_chat_id])
  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/booking/resources/${resource.id}`, {
        method: "POST",
        body: { telegram_chat_id: chat.trim() || null },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["booking-resources"] }),
  })
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-y-1">
        <Label size="small">Telegram chat for jobs</Label>
        <Input value={chat} aria-label="Telegram chat for staff alerts" placeholder="Staff group" onChange={(e) => setChat(e.target.value)} className="w-48" />
      </div>
      <Button size="small" variant="secondary" isLoading={save.isPending} onClick={() => save.mutate()}>
        Save
      </Button>
      {save.isSuccess && <Text size="xsmall" className="text-ui-fg-subtle">Saved.</Text>}
      {save.error && <Text size="xsmall" className="text-ui-fg-error">{errorText(save.error)}</Text>}
    </div>
  )
}

// Booked by whole days, like a rental (TASKS P3-22 follow-up): no opening
// hours, a booking takes whole local days. Changes how new bookings are made;
// existing bookings keep their times.
const WholeDays = ({ resource }: { resource: Resource }) => {
  const queryClient = useQueryClient()
  const toggle = useMutation({
    mutationFn: (whole_days: boolean) =>
      sdk.client.fetch(`/admin/booking/resources/${resource.id}`, { method: "POST", body: { whole_days } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["booking-resources"] }),
  })
  return (
    <label className="flex items-center gap-x-2">
      <input
        type="checkbox"
        checked={!!resource.whole_days}
        disabled={toggle.isPending}
        onChange={(e) => toggle.mutate(e.target.checked)}
      />
      <Text size="small">Booked by whole days (a rental: no hours, whole days only)</Text>
      {toggle.error && <Text size="xsmall" className="text-ui-fg-error">{errorText(toggle.error)}</Text>}
    </label>
  )
}

// Change a paid rental's dates or a trip's hours (owner, 2026-11-23: the
// difference is refunded; an extra is due at the venue).
const ChangeLength = ({ booking, rental, onDone }: { booking: CalendarBooking; rental: boolean; onDone: () => void }) => {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [hours, setHours] = useState("")
  const change = useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ refunded_amount: number; not_refunded: number; balance_due: number; balance_lowered: number; price: number }>(
        `/admin/booking/bookings/${booking.id}/change`,
        { method: "POST", body: rental ? { start_date: start, end_date: end } : { hours: Number(hours) } }
      ),
    onSuccess: onDone,
  })
  if (!open) {
    return (
      <Button size="small" variant="transparent" className="mt-1 ml-3 px-0" onClick={() => setOpen(true)}>
        {rental ? "Change dates" : "Change hours"}
      </Button>
    )
  }
  const ready = rental ? !!start && !!end : Number(hours) > 0
  return (
    <div className="mt-2 flex flex-col gap-2" data-testid="change-length-form">
      {rental ? (
        <div className="flex gap-2">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="First day" />
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Last day (or the day out)" />
        </div>
      ) : (
        <Input type="number" min={1} max={24} value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Hours" placeholder="Hours" className="w-28" />
      )}
      <Text size="xsmall" className="text-ui-fg-subtle">
        Priced again: cheaper refunds the difference, dearer is due at the venue.
      </Text>
      <div className="flex gap-2">
        <Button size="small" disabled={!ready} isLoading={change.isPending} onClick={() => change.mutate()}>
          Change
        </Button>
        <Button size="small" variant="secondary" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      {change.data && (
        <Text size="xsmall">
          New price {change.data.price}.{change.data.balance_lowered ? ` ${change.data.balance_lowered} off the balance due.` : ""}
          {change.data.refunded_amount ? ` Refunded ${change.data.refunded_amount}.` : ""}
          {change.data.not_refunded ? ` ${change.data.not_refunded} still to refund in the order (payment not captured).` : ""}
          {change.data.balance_due ? ` ${change.data.balance_due} due at the venue.` : ""}
        </Text>
      )}
      {change.error && <Text size="xsmall" className="text-ui-fg-error">{errorText(change.error)}</Text>}
    </div>
  )
}

const BookingsPage = () => {
  const queryClient = useQueryClient()
  const [resourceId, setResourceId] = useState("")
  const [view, setView] = useState<CalendarView>("day")
  const [date, setDate] = useState("")
  const [walkIn, setWalkIn] = useState({ time: "09:00", minutes: "60", notes: "" })
  // Two-step cancel in the page (no browser dialog): Cancel → Yes, cancel.
  const [confirming, setConfirming] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)

  const { data: resourcesData, isLoading: loadingResources } = useQuery({
    queryKey: ["booking-resources"],
    queryFn: () => sdk.client.fetch<{ resources: Resource[] }>("/admin/booking/resources"),
  })
  const resources = resourcesData?.resources ?? []
  const resource = resources.find((r) => r.id === resourceId)

  // First resource and today's date in its zone, once the list is loaded.
  useEffect(() => {
    if (!resourceId && resources.length) {
      setResourceId(resources[0].id)
    }
  }, [resources, resourceId])
  useEffect(() => {
    if (resource && !date) {
      setDate(todayIn(resource.timezone))
    }
  }, [resource, date])

  const window_ = useMemo(
    () => (resource && date ? viewWindow(date, view, resource.timezone) : null),
    [resource, date, view]
  )
  const { data, isLoading, error } = useQuery({
    queryKey: ["bookings", resourceId, window_?.from, window_?.to],
    enabled: !!window_,
    queryFn: () =>
      sdk.client.fetch<{ bookings: CalendarBooking[] }>("/admin/booking/bookings", {
        query: { resource_id: resourceId, from: window_!.from, to: window_!.to },
      }),
  })
  const days = date ? viewDays(date, view) : []
  const grouped = resource ? groupByLocalDay(data?.bookings ?? [], days, resource.timezone) : {}

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bookings"] })
  const createWalkIn = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/booking/bookings", {
        method: "POST",
        body: {
          resource_id: resourceId,
          ...walkInTimes(date, walkIn.time, Number(walkIn.minutes), resource!.timezone),
          notes: walkIn.notes || null,
        },
      }),
    onSuccess: () => {
      setWalkIn((w) => ({ ...w, notes: "" }))
      refresh()
    },
  })
  const cancel = useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch<{ refund: string; refunded_amount: number }>(`/admin/booking/bookings/${id}/cancel`, {
        method: "POST",
      }),
    onSuccess: refresh,
  })
  // A walk-in or cancel result belongs to the resource and day it was made
  // on: clear it when either changes (TASKS F-099).
  const { reset: resetWalkIn } = createWalkIn
  const { reset: resetCancel } = cancel
  useEffect(() => {
    resetWalkIn()
    resetCancel()
  }, [resourceId, date, resetWalkIn, resetCancel])

  if (loadingResources) {
    return <Container><Text>Loading…</Text></Container>
  }
  if (!resources.length) {
    return (
      <Container>
        <Heading level="h1">Bookings</Heading>
        <Text className="text-ui-fg-subtle mt-2">
          No bookable resources yet. Create one with POST /admin/booking/resources (name, type, weekly hours and the
          services it offers).
        </Text>
      </Container>
    )
  }

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex flex-col gap-y-4">
        <div>
          <Heading level="h1">Bookings</Heading>
          <Text className="text-ui-fg-subtle">
            Times are in {resource ? zoneLabel(resource.timezone) : "the calendar's time zone"}.
          </Text>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-y-1">
            <Label size="small">Resource</Label>
            <Select value={resourceId} onValueChange={setResourceId}>
              <Select.Trigger className="w-56"><Select.Value /></Select.Trigger>
              <Select.Content>
                {resources.map((r) => (
                  <Select.Item key={r.id} value={r.id}>
                    {r.name}{r.is_active ? "" : " (off)"}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small">View</Label>
            <Select value={view} onValueChange={(v) => setView(v as CalendarView)}>
              <Select.Trigger className="w-32"><Select.Value /></Select.Trigger>
              <Select.Content>
                <Select.Item value="day">Day</Select.Item>
                <Select.Item value="week">Week</Select.Item>
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={() => setDate(shiftDate(date, view, -1))}>Previous</Button>
          <Button variant="secondary" onClick={() => resource && setDate(todayIn(resource.timezone))}>Today</Button>
          <Button variant="secondary" onClick={() => setDate(shiftDate(date, view, 1))}>Next</Button>
        </div>
        {resource && <TelegramChat resource={resource} />}
        {resource && <WholeDays resource={resource} />}
        <Text size="xsmall" className="text-ui-fg-subtle">
          New and moved bookings on this calendar are sent to that chat (the person first messages the staff bot);
          without one, they go to the staff group with the calendar&apos;s name.
        </Text>
      </Container>

      <Container>
        {error && <Text className="text-ui-fg-error">{errorText(error)}</Text>}
        {isLoading && <Text>Loading…</Text>}
        <div className={view === "week" ? "grid grid-cols-1 gap-3 md:grid-cols-7" : "flex flex-col gap-3"}>
          {days.map((day) => (
            <div key={day} className="flex flex-col gap-2">
              <Text weight="plus" size="small">
                {new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                })}
              </Text>
              {(grouped[day] ?? []).length === 0 && <Text size="small" className="text-ui-fg-muted">No bookings</Text>}
              {(grouped[day] ?? []).map((b) => (
                <div key={b.id} className="rounded-md border border-ui-border-base p-2">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <Text size="small" weight="plus">{timeRange(b, resource!.timezone)}</Text>
                    <Badge size="2xsmall" color={STATUS_COLOR[b.status] ?? "grey"}>{statusLabel(b.status)}</Badge>
                  </div>
                  <Text size="small">{customerLabel(b)}</Text>
                  {b.order?.display_id != null && (
                    <Text size="xsmall" className="text-ui-fg-subtle">Order #{b.order.display_id}</Text>
                  )}
                  {b.address && !b.dropoff_address && <Text size="xsmall" className="text-ui-fg-subtle">Visit at: {b.address}</Text>}
                  {(b.seats ?? 1) > 1 && <Text size="xsmall" className="text-ui-fg-subtle">{b.seats} seats</Text>}
                  {b.dropoff_address && (
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Trip: {b.address} → {b.dropoff_address}
                    </Text>
                  )}
                  {b.notes && <Text size="xsmall" className="text-ui-fg-subtle">{b.notes}</Text>}
                  {(b.status === "confirmed" || b.status === "pending") && confirming !== b.id && (
                    <Button
                      size="small"
                      variant="transparent"
                      className="mt-1 px-0"
                      isLoading={cancel.isPending && cancel.variables === b.id}
                      onClick={() => setConfirming(b.id)}
                    >
                      Cancel
                    </Button>
                  )}
                  {(b.status === "confirmed" || b.status === "pending") && confirming !== b.id && moving !== b.id && (
                    <Button size="small" variant="transparent" className="mt-1 ml-3 px-0" onClick={() => setMoving(b.id)}>
                      Move
                    </Button>
                  )}
                  {b.status === "confirmed" && b.order && (resource?.whole_days || b.dropoff_address) && (
                    <ChangeLength booking={b} rental={!!resource?.whole_days} onDone={refresh} />
                  )}
                  {moving === b.id && (
                    <MoveForm
                      booking={b}
                      resources={resources}
                      current={resource!}
                      onClose={() => setMoving(null)}
                      onDone={() => {
                        setMoving(null)
                        refresh()
                      }}
                    />
                  )}
                  {confirming === b.id && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Text size="xsmall" className="text-ui-fg-subtle">The policy decides any refund.</Text>
                      <Button size="small" variant="secondary" onClick={() => setConfirming(null)}>
                        Keep
                      </Button>
                      <Button
                        size="small"
                        variant="danger"
                        onClick={() => {
                          setConfirming(null)
                          cancel.mutate(b.id)
                        }}
                      >
                        Yes, cancel
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        {cancel.error && <Text className="text-ui-fg-error mt-2">{errorText(cancel.error)}</Text>}
        {cancel.data && (
          <Text className="text-ui-fg-subtle mt-2">
            Cancelled. Refund: {cancel.data.refund.replace(/_/g, " ")}
            {cancel.data.refunded_amount ? ` (${cancel.data.refunded_amount})` : ""}.
          </Text>
        )}
      </Container>

      <Container className="flex flex-col gap-y-3">
        <Heading level="h2">Walk-in booking</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Books {resource?.name} on {date} at the counter: confirmed straight away, within the opening hours and capacity.
        </Text>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-y-1">
            <Label size="small">Start</Label>
            <Input type="time" value={walkIn.time} onChange={(e) => setWalkIn({ ...walkIn, time: e.target.value })} />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small">Minutes</Label>
            <Input
              type="number"
              min={5}
              step={5}
              value={walkIn.minutes}
              onChange={(e) => setWalkIn({ ...walkIn, minutes: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small">Notes</Label>
            <Input value={walkIn.notes} onChange={(e) => setWalkIn({ ...walkIn, notes: e.target.value })} />
          </div>
          <Button
            isLoading={createWalkIn.isPending}
            disabled={!resource || !date || !walkIn.time || !(Number(walkIn.minutes) > 0)}
            onClick={() => createWalkIn.mutate()}
          >
            Book walk-in
          </Button>
        </div>
        {createWalkIn.error && <Text className="text-ui-fg-error">{errorText(createWalkIn.error)}</Text>}
        {createWalkIn.isSuccess && <Text className="text-ui-fg-subtle">Walk-in booked.</Text>}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Bookings", icon: Calendar,
})

export default BookingsPage
