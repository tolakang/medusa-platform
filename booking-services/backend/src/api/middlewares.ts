import {
  authenticate,
  configureStoreSearch,
  defineMiddlewares,
  validateAndTransformBody,
  validateAndTransformQuery,
} from '@medusajs/framework/http'
import { PostAdminUploadLimit } from '@medusa-platform/medusa-core/api/admin/upload-limit/validators'
import { PostCustomerPassword } from '@medusa-platform/medusa-core/api/store/customers/me/password/validators'
import { PostWishlistItem } from '@medusa-platform/medusa-core/api/store/customers/me/wishlists/items/validators'
import {
  requireContact,
  requireContactBeforePayment,
  validatePhoneFields,
} from './contact-validation'
import { extendBookingHoldsBeforePayment, setDepositBeforePayment } from './booking-payment'
import { GetBookingCancelPreview, PostBookingCancel, PostBookingCart, PostBookingMove, PostQuoteAccept, PostPackage, PostQuoteRequest, PostRecurring, PostReview, PostWaitlist } from './store/booking/validators'
import {
  PostAdminBookingProvider,
  PostAdminBookingResource,
  PostAdminBookingResourceUpdate,
  PostAdminBookingStaffInvite,
  PostAdminCommissionSettle,
  PostAdminPayoutPay,
  PostAdminWalkIn,
  PostAdminZone,
  PostAdminZonePrice,
  PostAdminZoneUpdate,
  PostAdminZonePriceUpdate,
  PostAdminPass,
  PostAdminQuote,
  PostAdminBookingMove,
  PostAdminReview,
  PostAdminEventMove,
  PostAdminBookingChange,
} from './admin/booking/validators'
import { hideExtrasFilter } from './store-search-filters'
import { providerCors, requireProvider } from './provider-auth'
import {
  PostProviderAccept,
  PostProviderCreate,
  PostProviderDayOff,
  PostProviderHours,
  PostProviderMe,
  PostProviderService,
  PostProviderPackage,
  PostProviderPackageUpdate,
  PostProviderServiceUpdate,
  PostProviderWalkIn,
} from './providers/validators'
import { enforceUploadLimits } from '@medusa-platform/medusa-core/api/upload-limits'
import {
  AUTH_LIMITS,
  limitPerIp,
  limitVerificationEmails,
  requireCaptcha,
  requireStrongPassword,
} from '@medusa-platform/medusa-core/api/auth-guards'

// The product index declares filterable `status` and `sales_channel_ids`, so
// the route narrows it to published products in the key's sales channels.
export default defineMiddlewares({
  routes: [
    {
      method: ['POST'],
      matcher: '/store/search',
      middlewares: [
        configureStoreSearch({
          allowed_indexes: {
            // Extras are never listed on their own (store-search-filters.ts).
            product: { filters: hideExtrasFilter },
          },
        }),
      ],
    },
    {
      // Size and type limits for admin uploads (TASKS P1-11).
      method: ['POST'],
      matcher: '/admin/uploads',
      middlewares: [enforceUploadLimits],
    },
    {
      // Admin setting for the upload limit (TASKS P1-12).
      method: ['POST'],
      matcher: '/admin/upload-limit',
      middlewares: [validateAndTransformBody(PostAdminUploadLimit)],
    },
    {
      // Phone numbers: digits only (spaces, +, -, parentheses allowed).
      method: ['POST'],
      matcher: '/store/carts/:id',
      middlewares: [validatePhoneFields],
    },
    {
      // Required contact before the order is placed: the delivery phone in
      // Cambodia, the email elsewhere.
      method: ['POST'],
      matcher: '/store/carts/:id/complete',
      middlewares: [requireContact],
    },
    {
      // The same check before a payment starts (PayWay can complete the
      // cart from its callback).
      method: ['POST'],
      matcher: '/store/payment-collections/:id/payment-sessions',
      // Then renew the cart's booking holds for the payment (TASKS P3-06).
      // Then set the deposit as the amount due now (TASKS P3-26).
      middlewares: [requireContactBeforePayment, extendBookingHoldsBeforePayment, setDepositBeforePayment],
    },
    {
      // Admin booking setup and calendar (TASKS P3-11); /admin is admin-only.
      method: ['POST'],
      matcher: '/admin/booking/resources',
      middlewares: [validateAndTransformBody(PostAdminBookingResource)],
    },
    {
      method: ['POST'],
      matcher: '/admin/booking/resources/:id',
      middlewares: [validateAndTransformBody(PostAdminBookingResourceUpdate)],
    },
    {
      method: ['POST'],
      matcher: '/admin/booking/bookings',
      middlewares: [validateAndTransformBody(PostAdminWalkIn)],
    },
    {
      // Providers (TASKS P3-31): staff invitations, approval, suspension and
      // partner rates. /admin is admin-only.
      method: ['POST'],
      matcher: '/admin/booking/providers',
      middlewares: [validateAndTransformBody(PostAdminBookingStaffInvite)],
    },
    {
      method: ['POST'],
      matcher: '/admin/booking/providers/:id',
      middlewares: [validateAndTransformBody(PostAdminBookingProvider)],
    },
    {
      method: ['POST'],
      matcher: '/admin/booking/zones/:id',
      middlewares: [validateAndTransformBody(PostAdminZoneUpdate)],
    },
    {
      method: ['POST'],
      matcher: '/admin/booking/zone-prices/:id',
      middlewares: [validateAndTransformBody(PostAdminZonePriceUpdate)],
    },
    {
      method: ['POST'],
      matcher: '/admin/booking/passes/:id',
      middlewares: [validateAndTransformBody(PostAdminPass)],
    },
    {
      method: ['POST'],
      matcher: '/providers/me/bookings/:id/move',
      middlewares: [validateAndTransformBody(PostAdminBookingMove)],
    },
    {
      // Trip zones and their prices (TASKS P3-21).
      method: ['POST'],
      matcher: '/admin/booking/zones',
      middlewares: [validateAndTransformBody(PostAdminZone)],
    },
    {
      method: ['POST'],
      matcher: '/admin/booking/zone-prices',
      middlewares: [validateAndTransformBody(PostAdminZonePrice)],
    },
    {
      // Partner money (TASKS P3-33): settle a held commission, mark a payout paid.
      method: ['POST'],
      matcher: '/admin/booking/commissions/:id/settle',
      middlewares: [validateAndTransformBody(PostAdminCommissionSettle)],
    },
    {
      method: ['POST'],
      matcher: '/admin/booking/payouts/:id/pay',
      middlewares: [validateAndTransformBody(PostAdminPayoutPay)],
    },
    {
      // Provider portal routes (TASKS P3-31): PROVIDER_CORS, then a signed-in
      // active provider on every /providers route (provider-auth.ts); partner
      // sign-up and staff accept take a registration token.
      matcher: '/providers*',
      middlewares: [providerCors, requireProvider],
    },
    {
      method: ['POST'],
      matcher: '/providers',
      middlewares: [limitPerIp('provider_create', AUTH_LIMITS.signup, 60), validateAndTransformBody(PostProviderCreate)],
    },
    {
      method: ['POST'],
      matcher: '/providers/accept',
      middlewares: [limitPerIp('provider_accept', AUTH_LIMITS.signup, 60), validateAndTransformBody(PostProviderAccept)],
    },
    {
      method: ['POST'],
      matcher: '/providers/me',
      middlewares: [validateAndTransformBody(PostProviderMe)],
    },
    {
      // A provider's own calendars and services (TASKS P3-32).
      method: ['POST'],
      matcher: '/providers/me/bookings',
      middlewares: [validateAndTransformBody(PostProviderWalkIn)],
    },
    {
      method: ['POST'],
      matcher: '/providers/me/resources/:id',
      middlewares: [validateAndTransformBody(PostProviderHours)],
    },
    {
      method: ['POST'],
      matcher: '/providers/me/resources/:id/days-off',
      middlewares: [validateAndTransformBody(PostProviderDayOff)],
    },
    {
      method: ['POST'],
      matcher: '/providers/me/services',
      middlewares: [validateAndTransformBody(PostProviderService)],
    },
    {
      method: ['POST'],
      matcher: '/providers/me/packages/:id',
      middlewares: [validateAndTransformBody(PostProviderPackageUpdate)],
    },
    {
      // A partner's event package (TASKS P3-30).
      method: ['POST'],
      matcher: '/providers/me/packages',
      middlewares: [validateAndTransformBody(PostProviderPackage)],
    },
    {
      method: ['POST'],
      matcher: '/providers/me/services/:id',
      middlewares: [validateAndTransformBody(PostProviderServiceUpdate)],
    },
    {
      // Provider sign-up and sign-in: the same per-IP limits and password rule
      // as customers.
      method: ['POST'],
      matcher: '/auth/provider/emailpass/register',
      middlewares: [limitPerIp('provider_signup', AUTH_LIMITS.signup, 60), requireStrongPassword],
    },
    {
      method: ['POST'],
      matcher: '/auth/provider/emailpass',
      middlewares: [limitPerIp('provider_login', AUTH_LIMITS.login, 60)],
    },
    {
      method: ['POST'],
      matcher: '/auth/provider/emailpass/update',
      middlewares: [requireStrongPassword],
    },
    {
      method: ['POST'],
      matcher: '/auth/provider/emailpass/reset-password',
      middlewares: [limitPerIp('provider_password_reset', AUTH_LIMITS.password_reset, 60)],
    },
    {
      // A signed-in customer cancels their booking (TASKS P3-10).
      method: ['POST'],
      matcher: '/store/booking/cancel',
      middlewares: [authenticate('customer', ['session', 'bearer']), validateAndTransformBody(PostBookingCancel)],
    },
    {
      // What a cancel would refund, shown before the customer confirms.
      method: ['GET'],
      matcher: '/store/booking/cancel',
      middlewares: [authenticate('customer', ['session', 'bearer']), validateAndTransformQuery(GetBookingCancelPreview, {})],
    },
    {
      // Reviews (TASKS P3-29): anyone reads a service's reviews; a signed-in
      // customer writes one for a booking they had.
      method: ['POST'],
      matcher: '/store/booking/reviews',
      middlewares: [authenticate('customer', ['session', 'bearer']), validateAndTransformBody(PostReview)],
    },
    {
      method: ['POST'],
      matcher: '/admin/booking/reviews/:id',
      middlewares: [validateAndTransformBody(PostAdminReview)],
    },
    {
      // Passes (TASKS P3-29): the signed-in customer's own.
      method: ['GET'],
      matcher: '/store/booking/passes',
      middlewares: [authenticate('customer', ['session', 'bearer'])],
    },
    {
      // Waitlist (TASKS P3-29): a signed-in customer waits for a full day.
      method: ['GET', 'POST'],
      matcher: '/store/booking/waitlist*',
      middlewares: [authenticate('customer', ['session', 'bearer'])],
    },
    {
      method: ['POST'],
      matcher: '/store/booking/waitlist',
      middlewares: [validateAndTransformBody(PostWaitlist)],
    },
    {
      // Move a booking (TASKS P3-28): the customer reschedules, staff assign.
      method: ['POST'],
      matcher: '/store/booking/move',
      middlewares: [authenticate('customer', ['session', 'bearer']), validateAndTransformBody(PostBookingMove)],
    },
    {
      // Move a whole event package (TASKS P3-30 follow-up).
      method: ['POST'],
      matcher: '/admin/booking/events/:id/move',
      middlewares: [validateAndTransformBody(PostAdminEventMove)],
    },
    {
      // Change a paid rental's dates or a trip's hours (owner, 2026-11-23).
      method: ['POST'],
      matcher: '/admin/booking/bookings/:id/change',
      middlewares: [validateAndTransformBody(PostAdminBookingChange)],
    },
    {
      method: ['POST'],
      matcher: '/admin/booking/bookings/:id/move',
      middlewares: [validateAndTransformBody(PostAdminBookingMove)],
    },
    {
      // Quotes (TASKS P3-27): a signed-in customer asks, accepts, declines.
      method: ['GET', 'POST'],
      matcher: '/store/booking/quotes*',
      middlewares: [authenticate('customer', ['session', 'bearer'])],
    },
    {
      method: ['POST'],
      matcher: '/store/booking/quotes',
      middlewares: [validateAndTransformBody(PostQuoteRequest)],
    },
    {
      method: ['POST'],
      matcher: '/store/booking/quotes/:id/accept',
      middlewares: [validateAndTransformBody(PostQuoteAccept)],
    },
    {
      method: ['POST'],
      matcher: '/admin/booking/quotes/:id',
      middlewares: [validateAndTransformBody(PostAdminQuote)],
    },
    {
      // A signed-in customer cancels the rest of a weekly series (P3-29).
      method: ['POST'],
      matcher: '/store/booking/series/:id/cancel',
      middlewares: [authenticate('customer', ['session', 'bearer'])],
    },
    {
      // A signed-in customer cancels their event package (TASKS P3-30).
      method: ['POST'],
      matcher: '/store/booking/package/:id/cancel',
      middlewares: [authenticate('customer', ['session', 'bearer'])],
    },
    {
      // An event package on its date into the cart (TASKS P3-30).
      method: ['POST'],
      matcher: '/store/booking/package',
      middlewares: [validateAndTransformBody(PostPackage)],
    },
    {
      // The same time every week into the cart (TASKS P3-29).
      method: ['POST'],
      matcher: '/store/booking/recurring',
      middlewares: [validateAndTransformBody(PostRecurring)],
    },
    {
      // Hold a time and add it to the cart (TASKS P3-10, F-047).
      method: ['POST'],
      matcher: '/store/booking/cart',
      middlewares: [validateAndTransformBody(PostBookingCart)],
    },
    {
      // "Email me a reset link" while signed in: without a limit one session
      // could send reset emails without end (the public reset route is limited).
      method: ['POST'],
      matcher: '/store/customers/me/password-reset',
      middlewares: [limitPerIp('password_reset', AUTH_LIMITS.password_reset, 60)],
    },
    {
      // Change password while signed in (current + new, at least 8).
      method: ['POST'],
      matcher: '/store/customers/me/password',
      middlewares: [
        limitPerIp('password_change', AUTH_LIMITS.password_change, 60),
        validateAndTransformBody(PostCustomerPassword),
      ],
    },
    {
      // Wishlist item body (TASKS P1-19).
      method: ['POST'],
      matcher: '/store/customers/me/wishlists/items',
      middlewares: [validateAndTransformBody(PostWishlistItem)],
    },
    {
      // Customer passwords: at least 8 characters at sign-up and reset.
      method: ['POST'],
      matcher: '/auth/customer/emailpass/register',
      middlewares: [limitPerIp('signup', AUTH_LIMITS.signup, 60), requireCaptcha('signup'), requireStrongPassword],
    },
    {
      method: ['POST'],
      matcher: '/auth/customer/emailpass/update',
      middlewares: [requireStrongPassword],
    },
    {
      // REVIEW_FIXES B17: the same password rule when an admin sets a new one.
      method: ['POST'],
      matcher: '/auth/user/emailpass/update',
      middlewares: [requireStrongPassword],
    },
    {
      // Admin sign-in and forgot password (pre-deploy audit E-A1): the same
      // per-IP limits as the customer routes. The admin dashboard calls the
      // backend from the browser, so req.ip is the admin's address.
      method: ['POST'],
      matcher: '/auth/user/emailpass',
      middlewares: [limitPerIp('admin_login', AUTH_LIMITS.login, 60)],
    },
    {
      method: ['POST'],
      matcher: '/auth/user/emailpass/reset-password',
      middlewares: [limitPerIp('admin_password_reset', AUTH_LIMITS.password_reset, 60)],
    },
    {
      // CAPTCHA on customer sign-in and forgot password (sign-up above).
      method: ['POST'],
      matcher: '/auth/customer/emailpass',
      middlewares: [limitPerIp('login', AUTH_LIMITS.login, 60), requireCaptcha('login')],
    },
    {
      method: ['POST'],
      matcher: '/auth/customer/emailpass/reset-password',
      middlewares: [
        limitPerIp('password_reset', AUTH_LIMITS.password_reset, 60),
        requireCaptcha('password_reset'),
      ],
    },
    {
      // One verification email per address every 2 minutes.
      method: ['POST'],
      matcher: '/auth/verification/request',
      middlewares: [limitPerIp('verification', AUTH_LIMITS.verification, 60), limitVerificationEmails],
    },
    {
      method: ['POST'],
      matcher: '/store/customers',
      middlewares: [validatePhoneFields],
    },
    {
      method: ['POST'],
      matcher: '/store/customers/me',
      middlewares: [validatePhoneFields],
    },
    {
      method: ['POST'],
      matcher: '/store/customers/me/addresses',
      middlewares: [validatePhoneFields],
    },
    {
      method: ['POST'],
      matcher: '/store/customers/me/addresses/:address_id',
      middlewares: [validatePhoneFields],
    },
  ],
})
