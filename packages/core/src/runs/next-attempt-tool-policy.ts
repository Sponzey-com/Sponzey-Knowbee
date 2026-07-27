export type NextAttemptToolPolicy =
  | { mode: "unconstrained" }
  | { mode: "required"; toolNames: string[] }
  | { mode: "forbidden" }

export function buildNextAttemptToolPolicy(input: {
  followupExecutionMode?: "tool" | "response_only" | undefined
  requiredToolNames?: readonly string[] | undefined
}): NextAttemptToolPolicy {
  if (input.followupExecutionMode === "response_only") {
    return { mode: "forbidden" }
  }
  if (input.followupExecutionMode === "tool") {
    return {
      mode: "required",
      toolNames: [...new Set(input.requiredToolNames ?? [])].sort(),
    }
  }
  return { mode: "unconstrained" }
}
