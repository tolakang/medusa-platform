import type { VendorShipment } from "@lib/data/orders"
import { Heading, Text } from "@modules/common/components/ui"

// Each vendor's shipments with tracking, for the order's owner. Vendors ship
// separately, so one order can have several parcels.
export default function VendorShipments({
  shipments,
}: {
  shipments: VendorShipment[]
}) {
  if (!shipments.length) {
    return null
  }
  return (
    <div className="flex flex-col gap-y-3" data-testid="vendor-shipments">
      <Heading level="h2" className="text-xl-semi">
        Delivery
      </Heading>
      <ul className="flex flex-col gap-y-3">
        {shipments.map((s, i) => (
          <li key={s.vendor?.handle ?? i} className="flex flex-col gap-y-1">
            <Text className="txt-medium-plus text-ui-fg-base">
              {s.vendor ? `From ${s.vendor.name}` : "Shipment"}
            </Text>
            {s.fulfillments.length === 0 ? (
              <Text className="txt-medium text-ui-fg-subtle">Not shipped yet</Text>
            ) : (
              s.fulfillments.map((f) => (
                <div key={f.id} className="txt-medium text-ui-fg-subtle">
                  {f.delivered_at ? "Delivered" : f.shipped_at ? "Shipped" : "Being packed"}
                  {f.labels.map((l) => (
                    <span key={l.tracking_number}>
                      {" · Tracking "}
                      {l.tracking_url ? (
                        <a
                          href={l.tracking_url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="underline text-ui-fg-base"
                        >
                          {l.tracking_number}
                        </a>
                      ) : (
                        <span className="text-ui-fg-base">{l.tracking_number}</span>
                      )}
                    </span>
                  ))}
                </div>
              ))
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
