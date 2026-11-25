// POST /sellers/me/password { current_password, new_password }: the signed-in
// seller changes their password. The shared core's change-password route
// works for any signed-in actor: it checks the current password with the Auth
// Module and sets the new one (packages/medusa-core change-password workflow).
export { POST } from "@medusa-platform/medusa-core/api/store/customers/me/password/route"
