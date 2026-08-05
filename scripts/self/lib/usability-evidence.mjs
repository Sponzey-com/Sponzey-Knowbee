export const REQUIRED_USABILITY_TASKS = Object.freeze([
  "skill_connection",
  "agent_binding",
  "request_failure_recovery",
])

const COLLECTION_KINDS = new Set(["fixture", "live"])
const COLLECTION_STATUSES = new Set(["collected", "not_collected", "failed"])
const OUTCOMES = new Set(["success", "failure"])
const PRIVATE_KEYS = new Set([
  "email",
  "name",
  "path",
  "payload",
  "prompt",
  "raw",
  "request",
  "response",
  "token",
])
const MANUAL_AGGREGATE_KEYS = new Set([
  "aggregate",
  "completeparticipantcount",
  "phase10ready",
  "successrate",
])

export function evaluateUsabilityEvidence(evidence) {
  const validationErrors = []
  if (!isRecord(evidence)) {
    return invalidReport(["evidence_object_required"])
  }
  if (evidence.schemaVersion !== "knowbee.usability-evidence:v1") {
    validationErrors.push("schema_version_unsupported")
  }
  if (!COLLECTION_KINDS.has(evidence.collectionKind)) {
    validationErrors.push("collection_kind_invalid")
  }
  if (typeof evidence.buildIdentity !== "string" || !/^[a-zA-Z0-9._-]{3,128}$/u.test(evidence.buildIdentity)) {
    validationErrors.push("build_identity_invalid")
  }
  inspectForbiddenFields(evidence, "$", validationErrors)

  const deterministic = isRecord(evidence.deterministicAccessibility)
    ? evidence.deterministicAccessibility
    : null
  if (
    !deterministic ||
    typeof deterministic.passed !== "boolean" ||
    !Number.isInteger(deterministic.sampleCount) ||
    deterministic.sampleCount < 1 ||
    !Number.isInteger(deterministic.criticalViolationCount) ||
    deterministic.criticalViolationCount < 0
  ) {
    validationErrors.push("deterministic_accessibility_invalid")
  }

  const participants = Array.isArray(evidence.participants) ? evidence.participants : []
  if (!Array.isArray(evidence.participants)) validationErrors.push("participants_invalid")
  const aliases = new Set()
  let completeParticipantCount = 0
  let participantTaskCount = 0
  let participantTaskSuccessCount = 0
  for (const [index, participant] of participants.entries()) {
    const prefix = `participants[${index}]`
    if (!isRecord(participant)) {
      validationErrors.push(`${prefix}:participant_invalid`)
      continue
    }
    if (typeof participant.alias !== "string" || !/^[A-Z][A-Z0-9_-]{1,31}$/u.test(participant.alias)) {
      validationErrors.push(`${prefix}:participant_alias_invalid`)
    } else if (aliases.has(participant.alias)) {
      validationErrors.push(`${prefix}:participant_alias_duplicate`)
    } else {
      aliases.add(participant.alias)
    }
    if (!COLLECTION_STATUSES.has(participant.status)) {
      validationErrors.push(`${prefix}:collection_status_invalid`)
      continue
    }
    if (participant.status !== "collected") {
      if (!Array.isArray(participant.tasks) || participant.tasks.length !== 0) {
        validationErrors.push(`${prefix}:uncollected_tasks_must_be_empty`)
      }
      continue
    }
    const result = validateTasks(participant.tasks, prefix, validationErrors)
    if (result.complete) {
      completeParticipantCount += 1
      participantTaskCount += result.taskCount
      participantTaskSuccessCount += result.successCount
    }
  }

  const screenReaders = Array.isArray(evidence.screenReaders) ? evidence.screenReaders : []
  if (!Array.isArray(evidence.screenReaders)) validationErrors.push("screen_readers_invalid")
  const screenReaderSlots = new Set()
  const collectedPlatforms = new Set()
  let hasFailedScreenReader = false
  for (const [index, session] of screenReaders.entries()) {
    const prefix = `screenReaders[${index}]`
    if (!isRecord(session)) {
      validationErrors.push(`${prefix}:screen_reader_invalid`)
      continue
    }
    if (typeof session.slot !== "string" || !/^[a-z][a-z0-9_-]{1,31}$/u.test(session.slot)) {
      validationErrors.push(`${prefix}:screen_reader_slot_invalid`)
    } else if (screenReaderSlots.has(session.slot)) {
      validationErrors.push(`${prefix}:screen_reader_slot_duplicate`)
    } else {
      screenReaderSlots.add(session.slot)
    }
    if (!COLLECTION_STATUSES.has(session.status)) {
      validationErrors.push(`${prefix}:collection_status_invalid`)
      continue
    }
    if (typeof session.platform !== "string" || !["macos", "windows", "linux"].includes(session.platform)) {
      validationErrors.push(`${prefix}:screen_reader_platform_invalid`)
    }
    if (typeof session.technology !== "string" || !/^[a-z][a-z0-9_-]{1,31}$/u.test(session.technology)) {
      validationErrors.push(`${prefix}:screen_reader_technology_invalid`)
    }
    if (session.status === "failed") hasFailedScreenReader = true
    if (session.status !== "collected") {
      if (!Array.isArray(session.tasks) || session.tasks.length !== 0) {
        validationErrors.push(`${prefix}:uncollected_tasks_must_be_empty`)
      }
      continue
    }
    const result = validateTasks(session.tasks, prefix, validationErrors)
    if (result.complete) collectedPlatforms.add(session.platform)
  }

  const validationUnique = [...new Set(validationErrors)]
  const valid = validationUnique.length === 0
  const liveEvidence = evidence.collectionKind === "live"
  const participantTaskSuccessRate = participantTaskCount > 0
    ? participantTaskSuccessCount / participantTaskCount
    : 0
  const screenReaderMatrixComplete =
    collectedPlatforms.has("macos") &&
    (collectedPlatforms.has("windows") || collectedPlatforms.has("linux"))
  const screenReaderStatus = screenReaderMatrixComplete
    ? "collected"
    : hasFailedScreenReader
      ? "failed"
      : "not_collected"
  const blockingReasons = []
  if (!valid) blockingReasons.push("evidence_validation_failed")
  if (!liveEvidence) blockingReasons.push("live_evidence_not_collected")
  if (!deterministic?.passed || deterministic?.criticalViolationCount !== 0) {
    blockingReasons.push("deterministic_accessibility_failed")
  }
  if (completeParticipantCount < 5) blockingReasons.push("five_participants_not_collected")
  if (completeParticipantCount >= 5 && participantTaskSuccessRate < 0.9) {
    blockingReasons.push("participant_success_rate_below_90_percent")
  }
  if (!screenReaderMatrixComplete) blockingReasons.push("screen_reader_matrix_not_collected")

  return {
    valid,
    liveEvidence,
    phase10Ready: blockingReasons.length === 0,
    completeParticipantCount,
    participantTaskSuccessRate,
    screenReaderStatus,
    validationErrors: validationUnique,
    blockingReasons,
  }
}

function validateTasks(tasks, prefix, validationErrors) {
  if (!Array.isArray(tasks)) {
    validationErrors.push(`${prefix}:participant_tasks_incomplete`)
    return { complete: false, taskCount: 0, successCount: 0 }
  }
  const taskIds = new Set()
  let successCount = 0
  for (const [index, task] of tasks.entries()) {
    if (!isRecord(task) || typeof task.taskId !== "string") {
      validationErrors.push(`${prefix}.tasks[${index}]:task_invalid`)
      continue
    }
    if (taskIds.has(task.taskId)) validationErrors.push(`${prefix}:task_duplicate`)
    taskIds.add(task.taskId)
    if (!OUTCOMES.has(task.outcome)) validationErrors.push(`${prefix}:task_outcome_invalid`)
    if (!Number.isInteger(task.durationMs) || task.durationMs <= 0 || task.durationMs > 3_600_000) {
      validationErrors.push(`${prefix}:task_duration_invalid`)
    }
    if (task.outcome === "success") successCount += 1
  }
  const complete =
    tasks.length === REQUIRED_USABILITY_TASKS.length &&
    REQUIRED_USABILITY_TASKS.every((taskId) => taskIds.has(taskId))
  if (!complete) validationErrors.push(`${prefix}:participant_tasks_incomplete`)
  return { complete, taskCount: tasks.length, successCount }
}

function inspectForbiddenFields(value, path, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectForbiddenFields(item, `${path}[${index}]`, errors))
    return
  }
  if (!isRecord(value)) return
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase()
    if (path === "$" && MANUAL_AGGREGATE_KEYS.has(normalized)) {
      errors.push(`${path}.${key}:manual_aggregate_forbidden`)
    }
    if (PRIVATE_KEYS.has(normalized)) errors.push(`${path}.${key}:private_field_forbidden`)
    inspectForbiddenFields(item, `${path}.${key}`, errors)
  }
}

function invalidReport(validationErrors) {
  return {
    valid: false,
    liveEvidence: false,
    phase10Ready: false,
    completeParticipantCount: 0,
    participantTaskSuccessRate: 0,
    screenReaderStatus: "not_collected",
    validationErrors,
    blockingReasons: ["evidence_validation_failed"],
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
