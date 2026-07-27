export const PROMPT_IMPROVEMENT_TERMINAL_OUTPUT_FIELDS = [
  "state", "inspectedPromptSources", "changedPromptSources", "changeReason", "invariantsChecked",
  "testsPassed", "testsFailed", "activeNow", "reloadOrRestartRequired", "rollbackPath", "promptChanged", "noChangeStatement",
] as const

export interface PromptImprovementTerminalOutputFacts {
  state: "completed" | "blocked" | "rolled_back"
  inspectedPromptSources: string[]
  changedPromptSources: string[]
  changeReason: string
  invariantsChecked: string[]
  testsPassed: string[]
  testsFailed: string[]
  activeNow: boolean
  reloadOrRestartRequired: boolean
  rollbackPath: string
  promptChanged: boolean
  noChangeStatement: string
}

export type PromptImprovementTerminalOutputDecision =
  | { status: "authorized"; facts: PromptImprovementTerminalOutputFacts }
  | { status: "blocked"; reasonCode: "terminal_output_incomplete" | "terminal_output_source_mismatch" | "terminal_output_state_mismatch" | "no_change_statement_missing" }

const clean = (values: readonly string[]) => values.map((v) => v.trim()).filter(Boolean)
export function authorizePromptImprovementTerminalOutput(facts: PromptImprovementTerminalOutputFacts): PromptImprovementTerminalOutputDecision {
  const inspected = clean(facts.inspectedPromptSources)
  const changed = clean(facts.changedPromptSources)
  const invariants = clean(facts.invariantsChecked)
  const passed = clean(facts.testsPassed)
  const failed = clean(facts.testsFailed)
  if (!inspected.length || !facts.changeReason.trim() || !invariants.length || (!passed.length && !failed.length) || !facts.rollbackPath.trim()) {
    return { status: "blocked", reasonCode: "terminal_output_incomplete" }
  }
  if (changed.some((source) => !inspected.includes(source))) return { status: "blocked", reasonCode: "terminal_output_source_mismatch" }
  if ((facts.activeNow && facts.reloadOrRestartRequired) || (facts.state === "rolled_back" && facts.activeNow)) {
    return { status: "blocked", reasonCode: "terminal_output_state_mismatch" }
  }
  if (facts.promptChanged !== (changed.length > 0) || (!facts.promptChanged && !facts.noChangeStatement.trim())) {
    return { status: "blocked", reasonCode: "no_change_statement_missing" }
  }
  return { status: "authorized", facts: { ...facts, inspectedPromptSources: inspected, changedPromptSources: changed, invariantsChecked: invariants, testsPassed: passed, testsFailed: failed } }
}

export async function renderAuthorizedPromptImprovementTerminalOutput<T>(input: {
  decision: PromptImprovementTerminalOutputDecision
  userLanguage: string
  renderWithLlm: (facts: PromptImprovementTerminalOutputFacts, userLanguage: string) => Promise<T>
}): Promise<{ status: "rendered"; text: T } | Extract<PromptImprovementTerminalOutputDecision, { status: "blocked" }>> {
  if (input.decision.status !== "authorized") return input.decision
  if (!input.userLanguage.trim()) return { status: "blocked", reasonCode: "terminal_output_incomplete" }
  return { status: "rendered", text: await input.renderWithLlm(input.decision.facts, input.userLanguage) }
}
