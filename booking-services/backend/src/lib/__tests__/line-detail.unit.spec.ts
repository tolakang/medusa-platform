import { bookingLineDetail, packageLineDetail } from "../line-detail"

const tz = "Asia/Phnom_Penh"

describe("order line details (Booking)", () => {
  it("says when and with whom, in the calendar's zone", () => {
    expect(bookingLineDetail({ starts_at: "2026-11-25T02:00:00Z", ends_at: "2026-11-25T02:30:00Z", timezone: tz, resource_name: "Sophea" })).toBe(
      "Wed 25 Nov, 09:00–09:30 with Sophea"
    )
  })

  it("adds a trip's label and both addresses, seats, a visit address", () => {
    expect(
      bookingLineDetail({
        starts_at: "2026-11-30T01:00:00Z",
        ends_at: "2026-11-30T03:00:00Z",
        timezone: tz,
        resource_name: "Small trucks",
        trip_label: "Small truck, 2 hours",
        address: "#12, St 310",
        dropoff_address: "Wat Bo village",
      })
    ).toBe("Mon 30 Nov, 08:00–10:00 with Small trucks\nSmall truck, 2 hours\nFrom: #12, St 310\nTo: Wat Bo village")
    expect(bookingLineDetail({ starts_at: "2026-11-30T23:00:00Z", ends_at: "2026-12-01T05:00:00Z", timezone: tz, seats: 3 })).toBe(
      "Tue 1 Dec, 06:00–12:00\n3 seats"
    )
    expect(bookingLineDetail({ starts_at: "2026-11-25T02:00:00Z", ends_at: "2026-11-25T03:30:00Z", timezone: tz, address: "#5", pass: true })).toBe(
      "Wed 25 Nov, 09:00–10:30\nAt: #5\nPaid with your pass"
    )
  })

  it("gives a rental its dates, a package piece and the package its event", () => {
    expect(
      bookingLineDetail({
        starts_at: "2026-12-09T17:00:00Z",
        ends_at: "2026-12-10T17:00:00Z",
        timezone: tz,
        whole_days: true,
        trip_label: "1 night: 2026-12-10 to 2026-12-11",
        package_piece: true,
      })
    ).toBe("1 night: 2026-12-10 to 2026-12-11\nPart of your event package")
    expect(packageLineDetail("2026-12-05")).toBe("Event on Sat, 5 Dec 2026")
  })
})
