export type RecoveryBudgetKind = "interpretation" | "execution" | "delivery" | "external"
export type SubSessionRevisionBudgetClass = "default" | "format_only" | "risk_or_external" | "expensive"

export interface RecoveryBudgetState {
  kind: RecoveryBudgetKind
  used: number
  limit: number
  remaining: number
  policy: AttemptLimitPolicy
}

export type RecoveryBudgetUsage = Record<RecoveryBudgetKind, number>

export function createRecoveryBudgetUsage(): RecoveryBudgetUsage {
  return {
    interpretation: 0,
    execution: 0,
    delivery: 0,
    external: 0,
  }
}

export function getRecoveryBudgetLimit(kind: RecoveryBudgetKind, maxDelegationTurns: number): number {
  void kind
  const policy = resolveRecoveryBudgetPolicy(maxDelegationTurns)
  return policy.kind === "bounded" ? policy.maxRetries : 0
}

export function resolveRecoveryBudgetPolicy(maxDelegationTurns: number): AttemptLimitPolicy {
  void maxDelegationTurns
  return {
    kind: "strategy_guarded",
    policyVersion: "recovery.changed-strategy-guarded:v3",
  }
}

export function getRecoveryBudgetState(params: {
  usage: RecoveryBudgetUsage
  kind: RecoveryBudgetKind
  maxDelegationTurns: number
}): RecoveryBudgetState {
  const used = params.usage[params.kind] ?? 0
  const policy = resolveRecoveryBudgetPolicy(params.maxDelegationTurns)
  const limit = policy.kind === "bounded" ? policy.maxRetries : 0
  return {
    kind: params.kind,
    used,
    limit,
    remaining: limit > 0 ? Math.max(0, limit - used) : 0,
    policy,
  }
}

export function canConsumeRecoveryBudget(params: {
  usage: RecoveryBudgetUsage
  kind: RecoveryBudgetKind
  maxDelegationTurns: number
}): boolean {
  const state = getRecoveryBudgetState(params)
  if (state.policy.kind !== "bounded") return true
  return state.used < state.limit
}

export function consumeRecoveryBudget(params: {
  usage: RecoveryBudgetUsage
  kind: RecoveryBudgetKind
  maxDelegationTurns: number
}): RecoveryBudgetState {
  const state = getRecoveryBudgetState(params)
  if (state.policy.kind === "bounded" && state.used >= state.policy.maxRetries) {
    return state
  }
  params.usage[params.kind] = state.used + 1
  return getRecoveryBudgetState(params)
}

export function formatRecoveryBudgetProgress(state: RecoveryBudgetState): string {
  return `신호 ${state.used}`
}

export function getSubSessionRevisionBudgetLimit(budgetClass: SubSessionRevisionBudgetClass = "default"): number {
  void budgetClass
  return Number.MAX_SAFE_INTEGER
}

export function canRetrySubSessionRevision(params: {
  budgetClass?: SubSessionRevisionBudgetClass
  repeatedFailure?: boolean
}): boolean {
  void params.budgetClass
  if (params.repeatedFailure) return false
  return true
}
import {
  type AttemptLimitPolicy,
} from "../contracts/stop-report-decision.js"
