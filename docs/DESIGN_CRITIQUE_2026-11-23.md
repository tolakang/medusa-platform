# Design critique: all apps (2026-11-23)

This critique read the code only; nothing was run or tested in a browser. It covers 15 apps and about 210 screens.

Each finding is scored by severity, from S4 (stops a task or risks money or data) down to S1 (cosmetic). Each one gives the place in the code, the problem, the usability rule it breaks, and the fix.

The three findings marked ✔ were checked again in the code after the review.

## Fix first (S4)

| # | Where | Problem | Rule | Fix |
|---|---|---|---|---|
| 1 ✔ | `*/storefront/src/modules/common/components/input/index.tsx:42-56` (all 6 storefronts) | The `<input>` has no `id`, so `label htmlFor` points at nothing. The `errors` prop is never rendered. | WCAG 1.3.1, H9 | Give the input `id={props.id ?? name}` and render each field's error with `aria-invalid` and `aria-describedby`. |
| 2 ✔ | `marketplace/backend/src/admin/routes/vendor-payouts/page.tsx:136-169, 262-269` | Keep, Reduce and Cancel settle money in one click. Mark paid can't be undone. There is no confirmation and no toast. "Cancel" here means "pay the vendor nothing". | H5, H3, H2 | Use a `usePrompt` that names the vendor, order and amount. Rename the button to "Pay nothing". Show a success toast. |
| 3 | `marketplace/.../vendors/page.tsx:129`, `vendor-products/page.tsx:99`, `reseller/.../sellers/page.tsx:263` | Suspend and Reject run in one click, and suspending signs the seller out at once. | H5, H1 | Confirm first and say what will happen, then show a toast. |
| 4 | `marketplace/.../vendor-payouts`, `vendors`, `vendor-products` | Every row shares one `isPending`, so all rows spin and a second row can be sent mid-request. | H1 | Make the loading state per row, as `reseller/.../sellers/page.tsx:206` does. |
| 5 | `*/storefront/.../checkout/components/shipping-address/index.tsx:192,262`, `addresses/index.tsx:101-150`, `payment/index.tsx:173-223` | The 2-column grids and `w-1/3` columns have no phone breakpoint, so fields are about 100–160px wide. | Fitts, mobile | Use `grid-cols-1 small:grid-cols-2` and `flex-col small:flex-row`. |
| 6 | vendor portal, seller portal and POS `app/login/page.tsx` | There is no "Forgot password" anywhere. A cashier who is locked out can't sell. | H9, H3 | Port the booking portal's forgot and reset flow, and an admin reset link (PR #67). |
| 7 | `pos/pos-app/src/components/sell.tsx:164` | "Clear" sits next to Pay and wipes the whole cart in one tap. | H5, Fitts | Add undo or a confirmation, and move it away from Pay. |
| 8 | `booking-services/storefront/.../booking-picker/index.tsx:381-395, 403-411` | The repeat row is one `<label>` around a checkbox and two ~24px selects, so a mis-tap turns the series off. The Book button is disabled and says nothing about which field is missing. | Fitts, H9 | Put the switch on its own line with labelled 44px selects. Keep the button enabled, and on press show the error at the field and focus it. |

## Next (S3)

- **Payment** (`*/storefront/.../payment/index.tsx:143` ✔). `length && (…)` shows a literal "0" when there are no payment methods. `payment-button:172,247` shows `err.message` as it is, and `ErrorMessage` has no `role="alert"`. Fix: an empty-state message, plain-language payment errors, and `role="alert"`.
- **Template branding.** "Medusa Store" and "Powered by Medusa" still appear in the nav, footer, register page, hero and tab titles of every storefront. Fix: take the store name from one config value.
- **Tap targets under 44px.**
  - Storefront buttons and selects are `h-10`, and the delete icon is bare.
  - The vendor and seller portals' `.btn` and `.field` are about 36px, and their 14px input text makes iOS zoom in.
  - Booking slot, date and service chips are about 36–40px, with 3 slots per row at 360px.
  - Fix: `min-h-11`, and `text-base` on inputs.
- **Cart delete** (`delete-button/index.tsx:31`). It has no accessible name, swallows errors and has no undo. Wholesale "Empty cart" has no confirmation.
- **Booking slots.** While times load, the old ones can still be tapped. There's no `aria-live`, and "No free times" offers no "next free day".
- **Booking account list.** Picking a new time moves a paid booking at once. Cancel sits next to Change time. Status codes show raw (for example "no show"). Fix: select a time, then confirm it; use status labels.
- **Admin forms** (marketplace and reseller). Rate inputs take free text that becomes `NaN`, use placeholders instead of labels, give no toasts, and the help text names environment variables. These lists have no pagination, while POS and wholesale already paginate.
- **Vendor portal.** A pending shop sees three blank tabs. Products is a 5-column table that overflows a phone. Stock Save and Mark fulfilled give no feedback and have no undo. Orders have no "To fulfil" filter.
- **POS cashier speed.**
  - Paying takes 2 taps, Enter doesn't submit, and there are no shortcut keys.
  - The scanner gets focus back only on a 1-second timer, so scans can be lost.
  - A scan gives only weak feedback that it registered.
- **Wholesale quote status.** It shows labels from the system's side ("Pending Merchant") and an empty badge for an unknown status. "Request quote" is disabled with no reason given.
- **Wholesale approvals** (`approval-actions.tsx:57-80`). The icon-only approve and reject buttons have no `aria-label`.

## Later (S2–S1)

- Raw status text in the seller portal (sales and commissions) and the booking admin (`no_show`).
- `window.confirm` in the booking portal's Cancel and in trip-zones Delete; use an inline step or `Prompt` instead.
- The walk-in form has no customer name or phone.
- POS Deactivate has no confirmation while a shift is open.
- Invite codes are shown forever in the POS cashiers and reseller tables; show them only until they are used, and add a Copy button.
- The cart quantity is capped at 10 and has a duplicate option.
- Image `alt` is "Product image N" instead of the product name.
- "Price: Low -> High" sort labels.
- Empty states have no next step: vendor products and orders, the marketplace seller page.
- The star rating has no arrow keys, and booking notices have no `role="status"`.
- The marketplace "Parent" order link has no order number.

## Already good

- POS pages: 44px targets, toasts, labels and pagination.
- Wholesale uses `DataTable` and `usePrompt`.
- The booking portal's sign-in and the Providers page after PR #67.
- Wholesale's quick-order form errors.

## Suggested PRs

1. **core-ui:** storefront `Input` ids and errors, checkout phone layout, payment "0" and errors, tap sizes, branding. Copy the change to all 6 storefronts.
2. **marketplace/reseller admin:** confirmations, toasts, loading per row, labels and number inputs, pagination.
3. **portals:** password reset in the vendor and seller portals and POS; tap sizes; empty, pending and feedback states.
4. **pos-app:** keyboard-first paying, scanner focus, Clear with undo.
5. **booking:** the picker's repeat row and field errors, slot loading, confirming a new time.
