export const IDENTITY_NAME_MUTATION_TARGETS = ["main_agent_name", "user_name"] as const
export type IdentityNameMutationTarget = typeof IDENTITY_NAME_MUTATION_TARGETS[number]

export interface IdentityNameMutationIntentReceipt {
  requestId: string
  requester: string
  requesterType: "user" | "administrator"
  target: IdentityNameMutationTarget
  requestedAt: number
  expiresAt: number
}

export type IdentityNameMutationDecision =
  | { status: "authorized"; target: IdentityNameMutationTarget; requestId: string }
  | { status: "blocked"; reasonCode: "explicit_name_target_missing" | "name_target_mismatch" | "request_expired" }

export function authorizeIdentityNameMutation(input: {
  requestedTarget?: IdentityNameMutationTarget
  intent?: IdentityNameMutationIntentReceipt
  now: number
}): IdentityNameMutationDecision {
  if (!input.requestedTarget || !input.intent || !input.intent.requestId.trim() || !input.intent.requester.trim() || !["user", "administrator"].includes(input.intent.requesterType)) {
    return { status: "blocked", reasonCode: "explicit_name_target_missing" }
  }
  if (input.intent.target !== input.requestedTarget) return { status: "blocked", reasonCode: "name_target_mismatch" }
  if (input.intent.requestedAt > input.now || input.intent.expiresAt <= input.now) return { status: "blocked", reasonCode: "request_expired" }
  return { status: "authorized", target: input.requestedTarget, requestId: input.intent.requestId }
}

export async function executeAuthorizedIdentityNameMutation<T>(input: {
  decision: IdentityNameMutationDecision
  writerTarget: IdentityNameMutationTarget
  write: (target: IdentityNameMutationTarget) => Promise<T>
}): Promise<{ status: "written"; result: T } | { status: "blocked"; reasonCode: string }> {
  if (input.decision.status !== "authorized") return input.decision
  if (input.decision.target !== input.writerTarget) return { status: "blocked", reasonCode: "name_target_mismatch" }
  return { status: "written", result: await input.write(input.writerTarget) }
}
