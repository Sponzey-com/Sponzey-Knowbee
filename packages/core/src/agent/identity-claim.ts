export type IdentityClaimSubject = "main_agent" | "user" | "none"

export interface IdentityClaim {
  subject: IdentityClaimSubject
  claimed_name: string
}

export type IdentityClaimValidation =
  | { ok: true }
  | { ok: false; reasonCode: "main_agent_name_mismatch" | "user_name_mismatch" | "user_name_unset" }

export function validateIdentityClaim(input: {
  claim: IdentityClaim
  mainAgentName: string
  userName: string
}): IdentityClaimValidation {
  if (input.claim.subject === "none") return { ok: true }
  const claimedName = input.claim.claimed_name.trim()
  if (input.claim.subject === "main_agent") {
    return claimedName === input.mainAgentName.trim()
      ? { ok: true }
      : { ok: false, reasonCode: "main_agent_name_mismatch" }
  }
  const userName = input.userName.trim()
  if (!userName) return { ok: false, reasonCode: "user_name_unset" }
  return claimedName === userName
    ? { ok: true }
    : { ok: false, reasonCode: "user_name_mismatch" }
}
