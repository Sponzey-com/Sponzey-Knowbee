export const REQUIRED_HARNESS_GUARDRAILS = [
  "entry_conditions",
  "required_inputs",
  "invariants",
  "approval",
  "regression_tests",
  "audit_log",
  "rollback",
  "activation_confirmation",
] as const

export type PromptImprovementHarnessGuardrail = typeof REQUIRED_HARNESS_GUARDRAILS[number]
