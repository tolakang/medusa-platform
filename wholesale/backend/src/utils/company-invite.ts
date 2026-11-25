import { createHmac, timingSafeEqual } from "node:crypto";

// Joining a company needs the colleague's consent (REVIEW_FIXES B14). The
// starter let a company admin add any customer by id, without asking, and
// showed the admin that customer's email and phone. Now the admin asks for a
// join code for an email and gives it to the colleague; the colleague, signed
// in with that email, joins with it.
//
// Code = "<company id>.<10 characters>", the characters derived from the
// company id and the email with a server secret (HMAC). Nothing is stored.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 10;

const secret = () => {
  const value =
    process.env.INVITE_CODE_SECRET ||
    process.env.COOKIE_SECRET ||
    process.env.JWT_SECRET;
  if (value) {
    return value;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Set COOKIE_SECRET (or INVITE_CODE_SECRET) to issue join codes.");
  }
  return "supersecret";
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const signature = (companyId: string, email: string) => {
  const digest = createHmac("sha256", secret())
    .update(`company-invite:${companyId}:${normalizeEmail(email)}`)
    .digest();
  let code = "";
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[digest[i] % ALPHABET.length];
  }
  return code;
};

/** The join code of one company for one email. */
export const companyJoinCode = (companyId: string, email: string) =>
  `${companyId}.${signature(companyId, email)}`;

/**
 * The company a join code is for, when it was made for this email; else null.
 * Case and spaces in the code don't matter.
 */
export function companyFromJoinCode(code: unknown, email: string): string | null {
  if (typeof code !== "string") {
    return null;
  }
  const [rawId, given] = code.trim().split(".");
  // Company ids are "comp_" + an upper-case ULID, so the whole code is
  // case-insensitive (a lower-cased code used to be refused).
  if (!rawId || !given || !/^comp_[A-Za-z0-9]+$/i.test(rawId)) {
    return null;
  }
  const companyId = `comp_${rawId.slice(5).toUpperCase()}`;
  const a = Buffer.from(given.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  const b = Buffer.from(signature(companyId, email));
  return a.length === b.length && timingSafeEqual(a, b) ? companyId : null;
}
