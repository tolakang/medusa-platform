import {
  authenticate,
  type AuthenticatedMedusaRequest,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, parseCorsOrigins } from "@medusajs/framework/utils"
import cors from "cors"

// Access to /providers/* (BUILD_PLAN §9.3 "Providers", TASKS P3-31), as
// Marketplace's /vendors/* (marketplace/backend/src/api/vendor-auth.ts).
// Medusa's own CORS covers only /store, /admin and /auth (MEDUSA_SKILL §7), so
// /providers gets cors + parseCorsOrigins with PROVIDER_CORS. The portal's
// origins also go in AUTH_CORS for /auth/provider/*.
export function providerCors(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  return cors({ origin: parseCorsOrigins(process.env.PROVIDER_CORS ?? ""), credentials: true })(req, res, next)
}

// The only calls a registration token (no provider yet) may make: partner
// sign-up and staff accept.
export const PROVIDER_REGISTRATION_PATHS = ["/providers", "/providers/accept"]
// What a partner waiting for approval may still call.
export const PENDING_PROVIDER_PATHS = ["/providers/me"]

export const PROVIDER_SUSPENDED_MESSAGE = "This provider account is suspended."
export const PROVIDER_PENDING_MESSAGE = "This partner account is waiting for the shop's approval."

const providerAuth = authenticate("provider", ["session", "bearer"])
const registrationAuth = authenticate("provider", ["bearer"], { allowUnregistered: true })

// Every /providers route needs a signed-in, active provider, so a new route is
// protected without listing it here. A pending partner may only read
// /providers/me; a suspended provider's tokens stop working at once. Admin
// users and customers are refused (other actor types).
export function requireProvider(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const path = (req.originalUrl ?? req.url).split("?")[0].replace(/\/+$/, "")
  if (PROVIDER_REGISTRATION_PATHS.includes(path) && req.method === "POST") {
    return registrationAuth(req, res, next)
  }
  return providerAuth(req, res, (err?: unknown) => {
    if (err) {
      return next(err)
    }
    checkProviderStatus(req as AuthenticatedMedusaRequest, path).then(
      () => next(),
      (e) => next(e)
    )
  })
}

async function checkProviderStatus(req: AuthenticatedMedusaRequest, path: string) {
  const {
    data: [provider],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "booking_provider",
    fields: ["id", "status"],
    filters: { id: req.auth_context.actor_id },
  })
  const status = provider?.status
  if (!status || status === "suspended" || status === "invited") {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, PROVIDER_SUSPENDED_MESSAGE)
  }
  if (status === "pending" && !(PENDING_PROVIDER_PATHS.includes(path) && req.method === "GET")) {
    throw new MedusaError(MedusaError.Types.FORBIDDEN, PROVIDER_PENDING_MESSAGE)
  }
}

// What a provider sees of themself, with fixed fields (no `?fields`). Staff
// don't see money (P3-31 acceptance), so the commission rate is a partner's
// only.
export async function providerResponse(scope: MedusaContainer, providerId: string) {
  const {
    data: [provider],
  } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    {
      entity: "booking_provider",
      fields: [
        "id",
        "role",
        "status",
        "email",
        "name",
        "handle",
        "phone",
        "bio",
        "photo",
        "area",
        "commission_rate",
        "resources.id",
        "resources.name",
        "resources.type",
        "resources.timezone",
        "resources.is_active",
      ],
      filters: { id: providerId },
    },
    { throwIfKeyNotFound: true }
  )
  if (provider.role !== "partner") {
    const { commission_rate: _, ...staff } = provider
    return { provider: staff }
  }
  return { provider }
}
