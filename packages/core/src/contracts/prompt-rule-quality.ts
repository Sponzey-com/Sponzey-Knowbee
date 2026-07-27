export interface ExecutablePromptRuleStatement {
  ruleId: string
  actorRef: string
  condition: string
  requiredActions: string[]
  prohibitedActions: string[]
  completionCriterion: string
  sourceLine: number
  clauseCount: number
}

export interface PromptRuleQualityLimits {
  maxStatementCharacters: number
  maxClauses: number
  maxActions: number
}

export type PromptRuleQualityIssueCode =
  | "actor_missing"
  | "condition_missing"
  | "action_missing"
  | "action_conflict"
  | "completion_criterion_missing"
  | "statement_too_long"
  | "clause_limit_exceeded"
  | "action_limit_exceeded"
  | "duplicate_action"

export interface PromptRuleQualityIssue {
  ruleId: string
  sourceLine: number
  code: PromptRuleQualityIssueCode
  expected?: number
  actual?: number
}

export type PromptRuleQualityDecision =
  | { status: "eligible"; ruleIds: string[] }
  | { status: "blocked"; issues: PromptRuleQualityIssue[] }

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer.`)
  return value
}

function normalizeAction(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US")
}

export function evaluatePromptRuleQuality(input: {
  statements: ExecutablePromptRuleStatement[]
  limits: PromptRuleQualityLimits
}): PromptRuleQualityDecision {
  if (input.statements.length === 0) throw new Error("At least one prompt rule statement is required.")
  const maxStatementCharacters = positiveInteger(input.limits.maxStatementCharacters, "Maximum statement characters")
  const maxClauses = positiveInteger(input.limits.maxClauses, "Maximum clauses")
  const maxActions = positiveInteger(input.limits.maxActions, "Maximum actions")
  const ruleIds = new Set<string>()
  const issues: PromptRuleQualityIssue[] = []

  for (const statement of input.statements) {
    const ruleId = required(statement.ruleId, "Prompt rule ID")
    if (ruleIds.has(ruleId)) throw new Error(`Prompt rule IDs must be unique: ${ruleId}.`)
    ruleIds.add(ruleId)
    const sourceLine = positiveInteger(statement.sourceLine, "Prompt rule source line")
    const add = (code: PromptRuleQualityIssueCode, expected?: number, actual?: number): void => {
      issues.push({ ruleId, sourceLine, code, ...(expected === undefined ? {} : { expected }), ...(actual === undefined ? {} : { actual }) })
    }
    if (!statement.actorRef.trim()) add("actor_missing")
    if (!statement.condition.trim()) add("condition_missing")
    if (!statement.completionCriterion.trim()) add("completion_criterion_missing")
    const requiredActions = statement.requiredActions.map(normalizeAction).filter(Boolean)
    const prohibitedActions = statement.prohibitedActions.map(normalizeAction).filter(Boolean)
    const allActions = [...requiredActions, ...prohibitedActions]
    if (allActions.length === 0) add("action_missing")
    if (new Set(allActions).size !== allActions.length) add("duplicate_action")
    if (requiredActions.some((action) => prohibitedActions.includes(action))) add("action_conflict")
    if (allActions.length > maxActions) add("action_limit_exceeded", maxActions, allActions.length)
    if (!Number.isSafeInteger(statement.clauseCount) || statement.clauseCount <= 0 || statement.clauseCount > maxClauses) {
      add("clause_limit_exceeded", maxClauses, statement.clauseCount)
    }
    const characters = [statement.actorRef, statement.condition, ...statement.requiredActions, ...statement.prohibitedActions, statement.completionCriterion]
      .reduce((total, value) => total + value.trim().length, 0)
    if (characters > maxStatementCharacters) add("statement_too_long", maxStatementCharacters, characters)
  }
  return issues.length > 0 ? { status: "blocked", issues } : { status: "eligible", ruleIds: [...ruleIds] }
}

export async function writeQualityEligiblePromptRules<T>(input: {
  decision: PromptRuleQualityDecision
  write: (decision: Extract<PromptRuleQualityDecision, { status: "eligible" }>) => Promise<T>
}): Promise<{ status: "written"; result: T } | Extract<PromptRuleQualityDecision, { status: "blocked" }>> {
  if (input.decision.status !== "eligible") return input.decision
  return { status: "written", result: await input.write(input.decision) }
}
