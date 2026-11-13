/** Intake tokens are base64url (see settings/intake-actions.ts). Anything else is rejected before a DB lookup. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
