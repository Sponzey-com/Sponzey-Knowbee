export const PROMPT_IMPROVEMENT_LOG_FIELD_MANIFEST = {
  product: ["event", "state", "approvalRequired", "changeApplied", "activationState", "rollbackState", "finalResult"],
  field_debug: ["event", "sourceDiscovery", "checksumRef", "selectedTests", "transition", "retryCount", "blockedReason"],
  development: ["event", "diffRef", "fixtureNames", "fakeResponseRefs", "modelEvaluationRefs", "schemaPaths"],
} as const

export type PromptImprovementLogPurpose = keyof typeof PROMPT_IMPROVEMENT_LOG_FIELD_MANIFEST
export type PromptImprovementRuntimeMode = "production" | "development" | "test"

export type PromptImprovementLogProjectionDecision =
  | { status: "authorized"; purpose: PromptImprovementLogPurpose; fields: Record<string, unknown> }
  | { status: "blocked"; reasonCode: "development_log_forbidden" | "log_payload_unsafe" | "log_fields_missing" }

const FORBIDDEN = /rawPrompt|promptBody|rawPayload|secret|token|credential|privateMemory/iu

export function authorizePromptImprovementLogProjection(input: {
  runtimeMode: PromptImprovementRuntimeMode
  purpose: PromptImprovementLogPurpose
  fields: Record<string, unknown>
}): PromptImprovementLogProjectionDecision {
  if (input.purpose === "development" && input.runtimeMode === "production") {
    return { status: "blocked", reasonCode: "development_log_forbidden" }
  }
  if (Object.keys(input.fields).some((key) => FORBIDDEN.test(key))) {
    return { status: "blocked", reasonCode: "log_payload_unsafe" }
  }
  const allowed = new Set<string>(PROMPT_IMPROVEMENT_LOG_FIELD_MANIFEST[input.purpose])
  const fields = Object.fromEntries(Object.entries(input.fields).filter(([key]) => allowed.has(key)))
  if (!Object.keys(fields).length || typeof fields["event"] !== "string" || !fields["event"].trim()) {
    return { status: "blocked", reasonCode: "log_fields_missing" }
  }
  return { status: "authorized", purpose: input.purpose, fields }
}

export async function writeAuthorizedPromptImprovementLog<T>(input: {
  decision: PromptImprovementLogProjectionDecision
  write: (projection: Extract<PromptImprovementLogProjectionDecision, { status: "authorized" }>) => Promise<T>
}): Promise<{ status: "written"; result: T } | Extract<PromptImprovementLogProjectionDecision, { status: "blocked" }>> {
  if (input.decision.status !== "authorized") return input.decision
  return { status: "written", result: await input.write(input.decision) }
}
