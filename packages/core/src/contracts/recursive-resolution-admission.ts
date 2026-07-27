export interface ResolutionAttemptRecord {
  attemptId: string
  workId: string
  stepId: string
  meansId: string
  inputRefs: string[]
  targetId: string
  strategyFingerprint: string
  resultRefs: string[]
  failureCause?: string
  validation: {
    status: "sufficient" | "insufficient" | "failed"
    evidenceRefs: string[]
    reason: string
  }
}

export interface ProposedResolutionAttempt {
  attemptId: string
  meansId: string
  inputRefs: string[]
  targetId: string
  strategyFingerprint: string
}

export type ResolutionChangedDimension = "means" | "input" | "target" | "strategy"

export type NextResolutionAttemptAdmission =
  | {
      status: "allowed"
      workId: string
      attemptId: string
      changedDimensions: ResolutionChangedDimension[]
    }
  | {
      status: "rejected"
      reasonCodes: Array<
        | "resolution_input_invalid"
        | "attempt_record_invalid"
        | "attempt_id_duplicate"
        | "unchanged_attempt"
      >
    }

export type IncompleteWebRecoveryPath =
  | "source_fetch"
  | "alternate_source"
  | "dedicated_api"
  | "skill_or_mcp"
  | "other_means"

export interface IncompleteWebPathReview {
  path: IncompleteWebRecoveryPath
  status: "unreviewed" | "available" | "unavailable"
  evidenceRefs: string[]
}

export type IncompleteWebRecoveryAdmission =
  | { status: "selected"; workId: string; path: IncompleteWebRecoveryPath; evidenceRefs: string[] }
  | {
      status: "continue"
      workId: string
      availablePaths: IncompleteWebRecoveryPath[]
      unreviewedPaths: IncompleteWebRecoveryPath[]
    }
  | { status: "exhausted"; workId: string; reviewedPaths: IncompleteWebRecoveryPath[] }
  | {
      status: "rejected"
      reasonCodes: Array<
        | "web_recovery_input_invalid"
        | "failed_search_attempt_invalid"
        | "path_reviews_invalid"
        | "selected_path_unavailable"
      >
    }

const WEB_PATHS: readonly IncompleteWebRecoveryPath[] = [
  "source_fetch",
  "alternate_source",
  "dedicated_api",
  "skill_or_mcp",
  "other_means",
]

function normalized(value: string): string {
  return value.trim()
}

function uniqueText(values: string[], allowEmpty = false): boolean {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) return false
  const normalizedValues = values.map(normalized)
  return normalizedValues.every(Boolean) && new Set(normalizedValues).size === values.length
}

export function isValidResolutionAttemptRecord(record: ResolutionAttemptRecord): boolean {
  const failed = record.validation.status !== "sufficient"
  return Boolean(
    normalized(record.attemptId) &&
      normalized(record.workId) &&
      normalized(record.stepId) &&
      normalized(record.meansId) &&
      uniqueText(record.inputRefs) &&
      normalized(record.targetId) &&
      normalized(record.strategyFingerprint) &&
      uniqueText(record.resultRefs) &&
      uniqueText(record.validation.evidenceRefs) &&
      normalized(record.validation.reason) &&
      (failed ? normalized(record.failureCause ?? "") : !record.failureCause),
  )
}

function sameInputs(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => normalized(value) === normalized(right[index] ?? ""))
  )
}

function sameAttempt(prior: ResolutionAttemptRecord, next: ProposedResolutionAttempt): boolean {
  return (
    normalized(prior.meansId) === normalized(next.meansId) &&
    sameInputs(prior.inputRefs, next.inputRefs) &&
    normalized(prior.targetId) === normalized(next.targetId) &&
    normalized(prior.strategyFingerprint) === normalized(next.strategyFingerprint)
  )
}

export function admitNextResolutionAttempt(input: {
  workId: string
  unresolvedGoal: string
  priorAttempts: ResolutionAttemptRecord[]
  nextAttempt: ProposedResolutionAttempt
}): NextResolutionAttemptAdmission {
  const workId = normalized(input.workId)
  const next = input.nextAttempt
  if (
    !workId ||
    !normalized(input.unresolvedGoal) ||
    !normalized(next.attemptId) ||
    !normalized(next.meansId) ||
    !uniqueText(next.inputRefs) ||
    !normalized(next.targetId) ||
    !normalized(next.strategyFingerprint)
  ) {
    return { status: "rejected", reasonCodes: ["resolution_input_invalid"] }
  }
  if (
    !input.priorAttempts.every(
      (attempt) => isValidResolutionAttemptRecord(attempt) && normalized(attempt.workId) === workId,
    )
  ) {
    return { status: "rejected", reasonCodes: ["attempt_record_invalid"] }
  }
  if (
    input.priorAttempts.some(
      (attempt) => normalized(attempt.attemptId) === normalized(next.attemptId),
    )
  ) {
    return { status: "rejected", reasonCodes: ["attempt_id_duplicate"] }
  }
  if (input.priorAttempts.some((attempt) => sameAttempt(attempt, next))) {
    return { status: "rejected", reasonCodes: ["unchanged_attempt"] }
  }
  const previous = input.priorAttempts.at(-1)
  const changedDimensions: ResolutionChangedDimension[] = []
  if (!previous || normalized(previous.meansId) !== normalized(next.meansId))
    changedDimensions.push("means")
  if (!previous || !sameInputs(previous.inputRefs, next.inputRefs)) changedDimensions.push("input")
  if (!previous || normalized(previous.targetId) !== normalized(next.targetId))
    changedDimensions.push("target")
  if (
    !previous ||
    normalized(previous.strategyFingerprint) !== normalized(next.strategyFingerprint)
  )
    changedDimensions.push("strategy")
  return { status: "allowed", workId, attemptId: normalized(next.attemptId), changedDimensions }
}

export function admitIncompleteWebRecovery(input: {
  workId: string
  failedSearchAttempt: ResolutionAttemptRecord
  pathReviews: IncompleteWebPathReview[]
  selectedPath?: IncompleteWebRecoveryPath
}): IncompleteWebRecoveryAdmission {
  const workId = normalized(input.workId)
  if (!workId) return { status: "rejected", reasonCodes: ["web_recovery_input_invalid"] }
  if (
    !isValidResolutionAttemptRecord(input.failedSearchAttempt) ||
    normalized(input.failedSearchAttempt.workId) !== workId ||
    normalized(input.failedSearchAttempt.meansId) !== "web_search" ||
    input.failedSearchAttempt.validation.status === "sufficient"
  ) {
    return { status: "rejected", reasonCodes: ["failed_search_attempt_invalid"] }
  }
  const byPath = new Map(input.pathReviews.map((review) => [review.path, review]))
  if (
    byPath.size !== input.pathReviews.length ||
    input.pathReviews.some(
      (review) =>
        !WEB_PATHS.includes(review.path) ||
        (review.status === "unreviewed"
          ? review.evidenceRefs.length > 0
          : !uniqueText(review.evidenceRefs)),
    )
  ) {
    return { status: "rejected", reasonCodes: ["path_reviews_invalid"] }
  }
  const availablePaths = WEB_PATHS.filter((path) => byPath.get(path)?.status === "available")
  const unreviewedPaths = WEB_PATHS.filter(
    (path) => !byPath.has(path) || byPath.get(path)?.status === "unreviewed",
  )
  if (input.selectedPath) {
    const selected = byPath.get(input.selectedPath)
    if (selected?.status !== "available")
      return { status: "rejected", reasonCodes: ["selected_path_unavailable"] }
    return {
      status: "selected",
      workId,
      path: input.selectedPath,
      evidenceRefs: selected.evidenceRefs.map(normalized),
    }
  }
  if (availablePaths.length > 0 || unreviewedPaths.length > 0)
    return { status: "continue", workId, availablePaths, unreviewedPaths }
  return { status: "exhausted", workId, reviewedPaths: [...WEB_PATHS] }
}
