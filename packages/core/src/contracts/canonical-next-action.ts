export interface CanonicalModelToolUse {
  readonly id: string
  readonly name: string
  readonly input: Readonly<Record<string, unknown>>
}

export type CanonicalExecutionNextAction =
  | Readonly<{ kind: "response_only" }>
  | Readonly<{
      kind: "execute_tool"
      toolUseId: string
      toolName: string
      input: Readonly<Record<string, unknown>>
    }>

export type CanonicalExecutionNextActionAdmission =
  | Readonly<{ ok: true; action: CanonicalExecutionNextAction }>
  | Readonly<{
      ok: false
      reasonCode:
        | "canonical_next_action_multiple_tools"
        | "canonical_next_action_tool_invalid"
    }>

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function admitCanonicalExecutionNextAction(
  toolUses: readonly Readonly<{
    id: unknown
    name: unknown
    input: unknown
  }>[],
): CanonicalExecutionNextActionAdmission {
  if (toolUses.length === 0) {
    return Object.freeze({
      ok: true,
      action: Object.freeze({ kind: "response_only" }),
    })
  }
  if (toolUses.length !== 1) {
    return Object.freeze({
      ok: false,
      reasonCode: "canonical_next_action_multiple_tools",
    })
  }
  const toolUse = toolUses[0]
  if (!toolUse || !nonEmpty(toolUse.id) || !nonEmpty(toolUse.name) || !record(toolUse.input)) {
    return Object.freeze({
      ok: false,
      reasonCode: "canonical_next_action_tool_invalid",
    })
  }
  return Object.freeze({
    ok: true,
    action: Object.freeze({
      kind: "execute_tool",
      toolUseId: toolUse.id.trim(),
      toolName: toolUse.name.trim(),
      input: Object.freeze({ ...toolUse.input }),
    }),
  })
}
