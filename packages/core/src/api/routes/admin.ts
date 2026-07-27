import { createReadStream, existsSync, statSync } from "node:fs"
import { basename } from "node:path"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { authMiddleware } from "../middleware/auth.js"
import type { KnowbeeConfig } from "../../config/index.js"
import type { RuntimePaths } from "../../config/paths.js"
import { buildRuntimeManifest, type RuntimeManifestOptions } from "../../runtime/manifest.js"
import { insertAuditLog, insertDiagnosticEvent, listMessageLedgerEvents, type DbMessageLedgerEvent, type DbMessageLedgerStatus } from "../../db/index.js"
import { getUiModeState, isAdminUiEnabled, resolveAdminUiActivation, type UiModeRuntimeInput } from "../../ui/mode.js"
import { getControlTimeline, type ControlEventSeverity, type ControlTimeline, type ControlTimelineEvent, type ControlTimelineQuery } from "../../control-plane/timeline.js"
import { buildQueueBackpressureSnapshot, type QueueSnapshotItem } from "../../runs/queue-backpressure.js"
import { listRootRuns } from "../../runs/store.js"
import type { RootRun, RunStatus, RunStep, RunStepStatus } from "../../runs/types.js"
import { buildAdminToolRetrievalLab, runAdminWebRetrievalFixtureReplay } from "../../runs/admin-tool-lab.js"
import { buildAdminRuntimeInspectors } from "../../runs/admin-runtime-inspectors.js"
import { redactUiValue } from "../../ui/redaction.js"
import {
  buildAdminPlatformInspectors,
  getAdminDiagnosticExportJob,
  listAdminDiagnosticExportJobs,
  startAdminDiagnosticExport,
  type AdminDiagnosticExportJob,
} from "../../runs/admin-platform-inspectors.js"
import {
  executeArtifactCleanup,
  projectArtifactCleanupForUser,
  previewArtifactCleanup,
} from "../../release/artifact-retention.js"
import { getApiRuntimeConfig, getApiRuntimePaths } from "../runtime-context.js"

type AdminDangerousAction = "retry" | "purge" | "replay" | "export"

interface AdminActionRequestBody {
  action?: unknown
  targetId?: unknown
  confirmation?: unknown
  reason?: unknown
  params?: unknown
}

interface AdminLiveQuerystring {
  runId?: string
  requestGroupId?: string
  sessionKey?: string
  component?: string
  severity?: string
  channel?: string
  eventKind?: string
  status?: string
  deliveryKey?: string
  idempotencyKey?: string
  limit?: string
}

interface AdminToolLabQuerystring extends AdminLiveQuerystring {
  query?: string
}

interface AdminFixtureReplayBody {
  fixtureIds?: unknown
}

interface AdminDiagnosticExportBody {
  runId?: unknown
  requestGroupId?: unknown
  sessionKey?: unknown
  channel?: unknown
  includeTimeline?: unknown
  includeReport?: unknown
  limit?: unknown
}

interface AdminArtifactCleanupBody {
  maxAgeMs?: unknown
  confirmation?: unknown
  releaseOutputDir?: unknown
}

type AdminRunStageKey = "ingress" | "planning" | "tool_call" | "approval" | "delivery" | "recovery" | "completion"
type AdminStageStatus = "pending" | "running" | "completed" | "warning" | "failed"
type AdminDeliveryStatus = "not_requested" | "pending" | "delivered" | "failed" | "partial_success" | "suppressed"

interface AdminLiveStage {
  key: AdminRunStageKey
  label: string
  status: AdminStageStatus
  startedAt: number | null
  finishedAt: number | null
  durationMs: number | null
  eventCount: number
  ledgerCount: number
  summary: string | null
  failureReason: string | null
}

interface AdminLiveRunInspector {
  id: string
  requestGroupId: string
  sessionKey: string
  source: RootRun["source"]
  title: string
  status: RunStatus
  createdAt: number
  updatedAt: number
  lifecycle: AdminLiveStage[]
  failureReversal: boolean
  delivery: {
    status: AdminDeliveryStatus
    summary: string | null
    failureReason: string | null
    eventCount: number
  }
  recovery: {
    eventCount: number
    lastSummary: string | null
  }
}

interface AdminLedgerEventView {
  id: string
  runId: string | null
  requestGroupId: string | null
  sessionKey: string | null
  threadKey: string | null
  channel: string
  eventKind: string
  deliveryKey: string | null
  idempotencyKey: string | null
  status: DbMessageLedgerStatus
  summary: string
  channelTarget: string | null
  detail: unknown
  createdAt: number
}

interface AdminLedgerDuplicateView {
  key: string
  kind: "delivery" | "idempotency"
  count: number
  firstAt: number
  lastAt: number
  statuses: DbMessageLedgerStatus[]
}

interface AdminLiveResponse {
  ok: true
  generatedAt: number
  filters: Record<string, string | number | null>
  stream: {
    status: "connected" | "waiting_for_subscriber" | "backpressure"
    subscriptionCount: number
    reconnect: {
      supported: true
      strategy: "websocket_auto_reconnect"
      eventType: "control.event"
    }
    backpressure: {
      status: "ok" | "waiting" | "recovering" | "stopped"
      totalQueues: number
      affectedQueues: number
      queues: QueueSnapshotItem[]
    }
  }
  timeline: ControlTimeline
  runsInspector: { runs: AdminLiveRunInspector[] }
  messageLedger: {
    events: AdminLedgerEventView[]
    duplicates: AdminLedgerDuplicateView[]
    summary: {
      total: number
      delivered: number
      deliveryFailures: number
      suppressed: number
      duplicates: number
      statusCounts: Record<DbMessageLedgerStatus, number>
    }
  }
}

const DANGEROUS_ADMIN_ACTIONS: Array<{
  id: AdminDangerousAction
  label: string
  description: string
}> = [
  { id: "retry", label: "Retry", description: "Re-run a failed or interrupted unit of work." },
  { id: "purge", label: "Purge", description: "Delete historical or temporary runtime state." },
  { id: "replay", label: "Replay", description: "Replay a stored event or request path." },
  { id: "export", label: "Export", description: "Export diagnostic or runtime data." },
]

const SECRET_KEY_PATTERN =
  /api[_-]?key|token|secret|password|credential|authorization|cookie/i
const SESSION_IDENTIFIER_KEY_PATTERN =
  /^(?:session|session[_-]?(?:id|key|token)|source[_-]?id|target[_-]?session[_-]?id|parent[_-]?session[_-]?id)$/i
const INTERNAL_PATH_REDACTION = "[internal-path-redacted]"
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /xox[abprs]-[A-Za-z0-9-]{8,}/g,
  /\b\d{6,}:[A-Za-z0-9_-]{8,}\b/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\/(?:private\/)?var\/folders\/[^\s"'`<>]+/gi,
  /\/tmp\/[^\s"'`<>]+/gi,
  /\/Users\/[^\s"'`<>]+/gi,
  /[A-Z]:\\[^\s"'`<>]+/gi,
]

const CONTROL_SEVERITIES: ControlEventSeverity[] = ["debug", "info", "warning", "error"]
const LEDGER_STATUSES: DbMessageLedgerStatus[] = ["received", "pending", "started", "generated", "sent", "delivered", "succeeded", "failed", "skipped", "suppressed", "degraded"]
const ADMIN_STAGE_LABELS: Record<AdminRunStageKey, string> = {
  ingress: "Ingress",
  planning: "Planning",
  tool_call: "Tool call",
  approval: "Approval",
  delivery: "Delivery",
  recovery: "Recovery",
  completion: "Completion",
}
const ADMIN_STAGE_ORDER: AdminRunStageKey[] = ["ingress", "planning", "tool_call", "approval", "delivery", "recovery", "completion"]

function confirmationFor(action: AdminDangerousAction): string {
  return `CONFIRM ${action.toUpperCase()}`
}

function isDangerousAction(value: unknown): value is AdminDangerousAction {
  return typeof value === "string" && DANGEROUS_ADMIN_ACTIONS.some((action) => action.id === value)
}

function sanitizeText(value: string): string {
  let next = value
  for (const pattern of SECRET_VALUE_PATTERNS) {
    const replacement = pattern.source.includes("\\/") || pattern.source.includes("\\\\") ? INTERNAL_PATH_REDACTION : "***"
    next = next.replace(pattern, replacement)
  }
  return redactUiValue(next, { audience: "admin" }).value as string
}

type AdminDiagnosticExportJobView = Omit<AdminDiagnosticExportJob, "bundlePath"> & {
  bundlePath: string | null
  bundleUrl: string | null
}

function buildDiagnosticExportBundleUrl(job: AdminDiagnosticExportJob): string | null {
  if (!job.bundlePath || !job.bundleFile || job.status !== "succeeded") return null
  return `/api/admin/diagnostic-exports/${encodeURIComponent(job.id)}/bundle`
}

function redactDiagnosticExportJobForAdmin(job: AdminDiagnosticExportJob): AdminDiagnosticExportJobView {
  return {
    ...job,
    bundlePath: job.bundlePath ? INTERNAL_PATH_REDACTION : null,
    bundleUrl: buildDiagnosticExportBundleUrl(job),
  }
}

function sanitizeAdminAuditValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeText(value)
  if (Array.isArray(value)) return value.map(sanitizeAdminAuditValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (SECRET_KEY_PATTERN.test(key) || SESSION_IDENTIFIER_KEY_PATTERN.test(key)) {
        return [key, "***"]
      }
      return [key, sanitizeAdminAuditValue(item)]
    }))
  }
  return value
}

function sanitizeAdminGeneralValue(value: unknown): unknown {
  return redactUiValue(sanitizeAdminAuditValue(value), { audience: "admin" }).value
}

function sanitizeAdminResponse<T>(value: T): T {
  return sanitizeAdminGeneralValue(value) as T
}

function auditJson(value: unknown): string {
  return JSON.stringify(sanitizeAdminGeneralValue(value))
}

function parseLimit(value: string | undefined, fallback = 200, max = 1000): number {
  const parsed = Number.parseInt(value ?? "", 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(max, parsed))
}

function parseSeverity(value: string | undefined): ControlEventSeverity | undefined {
  return CONTROL_SEVERITIES.includes(value as ControlEventSeverity) ? value as ControlEventSeverity : undefined
}

function parseLedgerStatus(value: string | undefined): DbMessageLedgerStatus | undefined {
  return LEDGER_STATUSES.includes(value as DbMessageLedgerStatus) ? value as DbMessageLedgerStatus : undefined
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function sanitizeJsonText(raw: string | null): string | null {
  if (!raw) return null
  try {
    return JSON.stringify(sanitizeAdminGeneralValue(JSON.parse(raw)))
  } catch {
    return sanitizeText(raw)
  }
}

function sanitizeTimeline(timeline: ControlTimeline): ControlTimeline {
  return {
    ...timeline,
    events: timeline.events.map((event) => ({
      ...event,
      summary: sanitizeText(event.summary),
      detail: sanitizeAdminGeneralValue(event.detail),
      ...(event.duplicate
        ? {
            duplicate: {
              ...event.duplicate,
              key: sanitizeText(event.duplicate.key),
            },
          }
        : {}),
    })),
  }
}

function sanitizeRunForAdmin(run: RootRun): RootRun {
  return {
    ...run,
    title: sanitizeText(run.title),
    prompt: sanitizeText(run.prompt),
    summary: sanitizeText(run.summary),
    steps: run.steps.map((step) => ({
      ...step,
      title: sanitizeText(step.title),
      summary: sanitizeText(step.summary),
    })),
    recentEvents: run.recentEvents.map((event) => ({
      ...event,
      label: sanitizeText(event.label),
    })),
  }
}

function sanitizeLedgerEventForAdmin(event: DbMessageLedgerEvent): DbMessageLedgerEvent {
  return {
    ...event,
    delivery_key: event.delivery_key ? sanitizeText(event.delivery_key) : null,
    idempotency_key: event.idempotency_key ? sanitizeText(event.idempotency_key) : null,
    summary: sanitizeText(event.summary),
    detail_json: sanitizeJsonText(event.detail_json),
  }
}

function recomputeTimelineSummary(events: ControlTimelineEvent[]): ControlTimeline["summary"] {
  const severityCounts: Record<ControlEventSeverity, number> = { debug: 0, info: 0, warning: 0, error: 0 }
  for (const event of events) severityCounts[event.severity] += 1
  return {
    total: events.length,
    duplicateToolCount: events.filter((event) => event.duplicate?.kind === "tool").length,
    duplicateAnswerCount: events.filter((event) => event.duplicate?.kind === "answer").length,
    deliveryRetryCount: events.filter((event) => event.duplicate?.kind === "delivery").length,
    recoveryReentryCount: events.filter((event) => event.duplicate?.kind === "recovery").length,
    severityCounts,
  }
}

function getFilteredTimeline(query: AdminLiveQuerystring, limit: number): ControlTimeline {
  const severity = parseSeverity(query.severity)
  const timelineQuery: ControlTimelineQuery = {
    ...(query.runId ? { runId: query.runId } : {}),
    ...(query.requestGroupId ? { requestGroupId: query.requestGroupId } : {}),
    ...(query.component ? { component: query.component } : {}),
    ...(severity ? { severity } : {}),
    limit,
  }
  const timeline = getControlTimeline(timelineQuery, "developer")
  const events = query.sessionKey ? timeline.events.filter((event) => event.sessionKey === query.sessionKey) : timeline.events
  return events === timeline.events ? timeline : { events, summary: recomputeTimelineSummary(events) }
}

function stageForRunStep(step: RunStep): AdminRunStageKey {
  if (step.key === "received") return "ingress"
  if (step.key === "classified" || step.key === "target_selected") return "planning"
  if (step.key === "executing") return "tool_call"
  if (step.key === "awaiting_approval") return "approval"
  if (step.key === "awaiting_user") return "recovery"
  if (step.key === "finalizing" || step.key === "completed" || step.key === "reviewing") return "completion"
  return "planning"
}

function stageForControlEvent(event: ControlTimelineEvent): AdminRunStageKey {
  const type = event.eventType.toLowerCase()
  const component = event.component.toLowerCase()
  if (type.includes("delivery") || component.includes("delivery")) return "delivery"
  if (type.includes("approval") || component.includes("approval")) return "approval"
  if (type.includes("recovery") || component.includes("recovery")) return "recovery"
  if (type.includes("tool") || component.includes("tool")) return "tool_call"
  if (type.includes("complete") || type.includes("final") || type.includes("failed")) return "completion"
  if (type.includes("ingress") || type.includes("created") || component.includes("channel")) return "ingress"
  return "planning"
}

function stageForLedgerEvent(event: DbMessageLedgerEvent): AdminRunStageKey {
  const kind = event.event_kind
  if (kind === "ingress_received" || kind === "fast_receipt_sent") return "ingress"
  if (kind.startsWith("approval_")) return "approval"
  if (kind.startsWith("tool_")) return "tool_call"
  if (kind.includes("delivery") || kind.includes("delivered") || kind.includes("suppressed")) return "delivery"
  if (kind === "recovery_stop_generated") return "recovery"
  if (kind === "final_answer_generated") return "completion"
  return "planning"
}

function stepStatusToStageStatus(status: RunStepStatus): AdminStageStatus {
  if (status === "failed" || status === "cancelled") return "failed"
  if (status === "running") return "running"
  if (status === "completed") return "completed"
  return "pending"
}

function worseStageStatus(left: AdminStageStatus, right: AdminStageStatus): AdminStageStatus {
  const rank: Record<AdminStageStatus, number> = { pending: 0, completed: 1, running: 2, warning: 3, failed: 4 }
  return rank[right] > rank[left] ? right : left
}

function isLedgerDeliveryEvent(event: DbMessageLedgerEvent): boolean {
  return event.event_kind.includes("delivery") || event.event_kind.includes("delivered") || event.event_kind.includes("suppressed")
}

function isLedgerFailure(event: DbMessageLedgerEvent): boolean {
  return event.status === "failed" || event.status === "suppressed" || event.status === "degraded" || event.event_kind.endsWith("_failed") || event.event_kind === "recovery_stop_generated"
}

function isLedgerSuccess(event: DbMessageLedgerEvent): boolean {
  return event.status === "delivered" || event.status === "succeeded" || event.status === "sent"
}

function channelTargetFromDetail(detail: unknown): string | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null
  const record = detail as Record<string, unknown>
  const direct = record.channelTarget ?? record.target ?? record.targetId ?? record.chatId ?? record.threadId
  return typeof direct === "string" && direct.trim() ? direct.trim() : null
}

function mapLedgerEvent(event: DbMessageLedgerEvent): AdminLedgerEventView {
  const detail = parseJson(event.detail_json)
  return {
    id: event.id,
    runId: event.run_id,
    requestGroupId: event.request_group_id,
    sessionKey: event.session_key,
    threadKey: event.thread_key,
    channel: event.channel,
    eventKind: event.event_kind,
    deliveryKey: event.delivery_key,
    idempotencyKey: event.idempotency_key,
    status: event.status,
    summary: event.summary,
    channelTarget: channelTargetFromDetail(detail),
    detail,
    createdAt: event.created_at,
  }
}

function filterLedgerEvents(events: DbMessageLedgerEvent[], query: AdminLiveQuerystring): DbMessageLedgerEvent[] {
  const status = parseLedgerStatus(query.status)
  return events.filter((event) => {
    if (query.channel && event.channel !== query.channel) return false
    if (query.eventKind && event.event_kind !== query.eventKind) return false
    if (status && event.status !== status) return false
    if (query.deliveryKey && event.delivery_key !== query.deliveryKey) return false
    if (query.idempotencyKey && event.idempotency_key !== query.idempotencyKey) return false
    return true
  })
}

function buildLedgerDuplicates(events: DbMessageLedgerEvent[]): AdminLedgerDuplicateView[] {
  const groups = new Map<string, { kind: "delivery" | "idempotency"; events: DbMessageLedgerEvent[] }>()
  for (const event of events) {
    if (event.delivery_key) {
      const key = `delivery:${event.delivery_key}`
      const group = groups.get(key) ?? { kind: "delivery" as const, events: [] }
      group.events.push(event)
      groups.set(key, group)
    }
    if (event.idempotency_key) {
      const key = `idempotency:${event.idempotency_key}`
      const group = groups.get(key) ?? { kind: "idempotency" as const, events: [] }
      group.events.push(event)
      groups.set(key, group)
    }
  }
  return [...groups.entries()]
    .filter(([, group]) => group.events.length > 1)
    .map(([key, group]) => {
      const ordered = [...group.events].sort((a, b) => a.created_at - b.created_at)
      return {
        key: key.replace(/^(delivery|idempotency):/, ""),
        kind: group.kind,
        count: group.events.length,
        firstAt: ordered[0]?.created_at ?? 0,
        lastAt: ordered.at(-1)?.created_at ?? 0,
        statuses: [...new Set(group.events.map((event) => event.status))],
      }
    })
}

function buildLedgerSummary(events: DbMessageLedgerEvent[], duplicates: AdminLedgerDuplicateView[]): AdminLiveResponse["messageLedger"]["summary"] {
  const statusCounts = Object.fromEntries(LEDGER_STATUSES.map((status) => [status, 0])) as Record<DbMessageLedgerStatus, number>
  for (const event of events) statusCounts[event.status] += 1
  return {
    total: events.length,
    delivered: events.filter((event) => isLedgerDeliveryEvent(event) && isLedgerSuccess(event)).length,
    deliveryFailures: events.filter((event) => isLedgerDeliveryEvent(event) && isLedgerFailure(event)).length,
    suppressed: events.filter((event) => event.status === "suppressed" || event.event_kind.includes("suppressed")).length,
    duplicates: duplicates.length,
    statusCounts,
  }
}

function buildDeliverySummary(events: DbMessageLedgerEvent[]): AdminLiveRunInspector["delivery"] {
  const deliveryEvents = events.filter(isLedgerDeliveryEvent)
  const failed = deliveryEvents.filter(isLedgerFailure)
  const delivered = deliveryEvents.filter(isLedgerSuccess)
  const suppressed = deliveryEvents.filter((event) => event.status === "suppressed" || event.event_kind.includes("suppressed"))
  const latest = deliveryEvents.at(-1)
  const status: AdminDeliveryStatus = suppressed.length > 0
    ? "suppressed"
    : failed.length > 0 && delivered.length > 0
      ? "partial_success"
      : failed.length > 0
        ? "failed"
        : delivered.length > 0
          ? "delivered"
          : deliveryEvents.some((event) => event.status === "pending" || event.status === "started" || event.status === "generated")
            ? "pending"
            : "not_requested"
  return {
    status,
    summary: latest?.summary ?? null,
    failureReason: failed.at(-1)?.summary ?? null,
    eventCount: deliveryEvents.length,
  }
}

function buildRunLifecycle(run: RootRun, timelineEvents: ControlTimelineEvent[], ledgerEvents: DbMessageLedgerEvent[]): AdminLiveStage[] {
  const buckets = new Map<AdminRunStageKey, {
    status: AdminStageStatus
    startedAt: number | null
    finishedAt: number | null
    eventCount: number
    ledgerCount: number
    summary: string | null
    failureReason: string | null
  }>()
  for (const key of ADMIN_STAGE_ORDER) {
    buckets.set(key, { status: "pending", startedAt: null, finishedAt: null, eventCount: 0, ledgerCount: 0, summary: null, failureReason: null })
  }

  const touchTime = (bucket: NonNullable<ReturnType<typeof buckets.get>>, at: number | null | undefined) => {
    if (!at) return
    bucket.startedAt = bucket.startedAt == null ? at : Math.min(bucket.startedAt, at)
    bucket.finishedAt = bucket.finishedAt == null ? at : Math.max(bucket.finishedAt, at)
  }

  for (const step of run.steps) {
    const bucket = buckets.get(stageForRunStep(step))!
    bucket.status = worseStageStatus(bucket.status, stepStatusToStageStatus(step.status))
    bucket.summary = step.summary || bucket.summary
    if (step.status === "failed" || step.status === "cancelled") bucket.failureReason = step.summary || bucket.failureReason
    touchTime(bucket, step.startedAt)
    touchTime(bucket, step.finishedAt)
  }

  for (const event of timelineEvents) {
    const bucket = buckets.get(stageForControlEvent(event))!
    bucket.eventCount += 1
    bucket.summary = event.summary || bucket.summary
    if (event.severity === "error") {
      bucket.status = "failed"
      bucket.failureReason = event.summary
    } else if (event.severity === "warning") {
      bucket.status = worseStageStatus(bucket.status, "warning")
    } else if (bucket.status === "pending") {
      bucket.status = "completed"
    }
    touchTime(bucket, event.at)
  }

  for (const event of ledgerEvents) {
    const bucket = buckets.get(stageForLedgerEvent(event))!
    bucket.ledgerCount += 1
    bucket.summary = event.summary || bucket.summary
    if (event.status === "failed" || event.status === "suppressed") {
      bucket.status = "failed"
      bucket.failureReason = event.summary
    } else if (event.status === "degraded") {
      bucket.status = worseStageStatus(bucket.status, "warning")
      bucket.failureReason = event.summary
    } else if (bucket.status === "pending") {
      bucket.status = "completed"
    }
    touchTime(bucket, event.created_at)
  }

  const ingress = buckets.get("ingress")!
  touchTime(ingress, run.createdAt)
  if (ingress.status === "pending") ingress.status = "completed"

  const completion = buckets.get("completion")!
  if (run.status === "completed") completion.status = "completed"
  if (run.status === "failed" || run.status === "cancelled" || run.status === "interrupted") {
    completion.status = "failed"
    completion.failureReason = run.summary
  }
  touchTime(completion, run.updatedAt)

  return ADMIN_STAGE_ORDER.map((key) => {
    const bucket = buckets.get(key)!
    const durationMs = bucket.startedAt != null && bucket.finishedAt != null ? Math.max(0, bucket.finishedAt - bucket.startedAt) : null
    return { key, label: ADMIN_STAGE_LABELS[key], ...bucket, durationMs }
  })
}

function buildRunsInspector(runs: RootRun[], timeline: ControlTimeline, ledgerEvents: DbMessageLedgerEvent[]): AdminLiveRunInspector[] {
  return runs.map((run) => {
    const runTimeline = timeline.events.filter((event) => event.runId === run.id || event.requestGroupId === run.requestGroupId)
    const runLedger = ledgerEvents.filter((event) => event.run_id === run.id || event.request_group_id === run.requestGroupId)
    const delivery = buildDeliverySummary(runLedger)
    const recoveryEvents = runLedger.filter((event) => stageForLedgerEvent(event) === "recovery")
    const recoveryTimeline = runTimeline.filter((event) => stageForControlEvent(event) === "recovery")
    return {
      id: run.id,
      requestGroupId: run.requestGroupId,
      sessionKey: run.sessionId,
      source: run.source,
      title: run.title,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      lifecycle: buildRunLifecycle(run, runTimeline, runLedger),
      failureReversal: run.status === "completed" && (runTimeline.some((event) => event.severity === "error" || event.severity === "warning") || runLedger.some(isLedgerFailure)),
      delivery,
      recovery: {
        eventCount: recoveryEvents.length + recoveryTimeline.length,
        lastSummary: recoveryEvents.at(-1)?.summary ?? recoveryTimeline.at(-1)?.summary ?? null,
      },
    }
  })
}

function buildStreamStatus(options: AdminRouteOptions, config: KnowbeeConfig, paths: RuntimePaths): AdminLiveResponse["stream"] {
  const manifest = buildRuntimeManifest(buildAdminRuntimeManifestOptions(options, config, paths))
  const queues = buildQueueBackpressureSnapshot()
  const affected = queues.filter((queue) => queue.status !== "ok")
  const aggregateStatus = affected.some((queue) => queue.status === "recovering")
    ? "recovering"
    : affected.some((queue) => queue.status === "waiting")
      ? "waiting"
      : "ok"
  return {
    status: affected.length > 0 ? "backpressure" : manifest.adminUi.subscriptionCount > 0 ? "connected" : "waiting_for_subscriber",
    subscriptionCount: manifest.adminUi.subscriptionCount,
    reconnect: {
      supported: true,
      strategy: "websocket_auto_reconnect",
      eventType: "control.event",
    },
    backpressure: {
      status: aggregateStatus,
      totalQueues: queues.length,
      affectedQueues: affected.length,
      queues,
    },
  }
}

function buildAdminLive(query: AdminLiveQuerystring, options: AdminRouteOptions, config: KnowbeeConfig, paths: RuntimePaths): AdminLiveResponse {
  const limit = parseLimit(query.limit)
  const timeline = sanitizeTimeline(getFilteredTimeline(query, limit))
  const runs = listRootRuns(limit).filter((run) => {
    if (query.runId && run.id !== query.runId) return false
    if (query.requestGroupId && run.requestGroupId !== query.requestGroupId) return false
    if (query.sessionKey && run.sessionId !== query.sessionKey) return false
    return true
  }).map(sanitizeRunForAdmin)
  const ledgerBase = listMessageLedgerEvents({
    ...(query.runId ? { runId: query.runId } : {}),
    ...(query.requestGroupId ? { requestGroupId: query.requestGroupId } : {}),
    ...(query.sessionKey ? { sessionKey: query.sessionKey } : {}),
    limit,
  }).map(sanitizeLedgerEventForAdmin)
  const ledgerEvents = filterLedgerEvents(ledgerBase, query)
  const duplicates = buildLedgerDuplicates(ledgerEvents)
  return {
    ok: true,
    generatedAt: Date.now(),
    filters: {
      runId: query.runId ?? null,
      requestGroupId: query.requestGroupId ?? null,
      sessionKey: query.sessionKey ?? null,
      component: query.component ?? null,
      severity: parseSeverity(query.severity) ?? null,
      channel: query.channel ?? null,
      eventKind: query.eventKind ?? null,
      status: parseLedgerStatus(query.status) ?? null,
      deliveryKey: query.deliveryKey ?? null,
      idempotencyKey: query.idempotencyKey ?? null,
      limit,
    },
    stream: buildStreamStatus(options, config, paths),
    timeline,
    runsInspector: { runs: buildRunsInspector(runs, timeline, ledgerBase) },
    messageLedger: {
      events: ledgerEvents.map(mapLedgerEvent),
      duplicates,
      summary: buildLedgerSummary(ledgerEvents, duplicates),
    },
  }
}

function recordAdminAudit(input: {
  toolName: string
  params?: unknown
  output?: unknown
  result: string
  approvalRequired?: boolean
  approvedBy?: string | null
  errorCode?: string
  stopReason?: string
}): void {
  insertAuditLog({
    timestamp: Date.now(),
    session_id: null,
    source: "webui.admin",
    tool_name: input.toolName,
    params: input.params === undefined ? null : auditJson(input.params),
    output: input.output === undefined ? null : auditJson(input.output),
    result: input.result,
    duration_ms: null,
    approval_required: input.approvalRequired ? 1 : 0,
    approved_by: input.approvedBy ?? null,
    error_code: input.errorCode ?? null,
    stop_reason: input.stopReason ?? null,
  })
}

export interface AdminRouteOptions {
  uiModeRuntime?: UiModeRuntimeInput
}

function buildAdminRuntimeManifestOptions(options: AdminRouteOptions, config: KnowbeeConfig, paths: RuntimePaths): RuntimeManifestOptions {
  const base: RuntimeManifestOptions = { includeEnvironment: false, includeReleasePackage: false, config, paths }
  const adminActivation = {
    ...(options.uiModeRuntime?.adminActivation ?? {}),
    configEnabled:
      options.uiModeRuntime?.adminActivation?.configEnabled ?? config.webui.admin?.enabled ?? false,
  }
  return { ...base, adminActivation }
}

function recordAdminGuardFailure(req: FastifyRequest, options: AdminRouteOptions): void {
  try {
    const activation = resolveAdminUiActivation(options.uiModeRuntime?.adminActivation)
    const params = {
      method: req.method,
      url: req.url,
      remoteAddress: req.socket.remoteAddress ?? null,
      activation,
    }
    insertDiagnosticEvent({
      kind: "admin.guard.denied",
      summary: "Admin API access denied because Admin UI is not enabled.",
      detail: params,
    })
    recordAdminAudit({
      toolName: "admin.guard",
      params,
      output: { ok: false, error: "admin_ui_disabled" },
      result: "blocked",
      errorCode: "admin_ui_disabled",
      stopReason: "admin_guard_disabled",
    })
  } catch {
    // Guard diagnostics must not turn a blocked admin request into a 500.
  }
}

function buildAdminShell(options: AdminRouteOptions, config: KnowbeeConfig, paths: RuntimePaths) {
  const manifest = buildRuntimeManifest(buildAdminRuntimeManifestOptions(options, config, paths))
  return {
    kind: "admin_shell",
    title: "Admin tools",
    warning: "Developer diagnostics are active. Dangerous actions require explicit confirmation and audit logging.",
    badges: [
      { label: manifest.adminUi.enabled ? "ADMIN ENABLED" : "ADMIN DISABLED", tone: manifest.adminUi.enabled ? "danger" : "neutral" },
      { label: `WS SUBSCRIBERS ${manifest.adminUi.subscriptionCount}`, tone: "neutral" },
      { label: "AUDIT REQUIRED", tone: "warning" },
    ],
    dangerousActions: DANGEROUS_ADMIN_ACTIONS.map((action) => ({
      ...action,
      requiredConfirmation: confirmationFor(action.id),
      auditRequired: true,
    })),
    subscriptions: {
      webSocketClients: manifest.adminUi.subscriptionCount,
    },
    auditRequired: true,
  }
}

function normalizeActionBody(body: unknown): AdminActionRequestBody {
  if (!body || typeof body !== "object") return {}
  return body as AdminActionRequestBody
}

function normalizeFixtureReplayBody(body: unknown): AdminFixtureReplayBody {
  if (!body || typeof body !== "object") return {}
  return body as AdminFixtureReplayBody
}

function normalizeDiagnosticExportBody(body: unknown): AdminDiagnosticExportBody {
  if (!body || typeof body !== "object") return {}
  return body as AdminDiagnosticExportBody
}

function normalizeArtifactCleanupBody(body: unknown): AdminArtifactCleanupBody {
  if (!body || typeof body !== "object") return {}
  return body as AdminArtifactCleanupBody
}

function normalizeFixtureIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function optionalBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

function optionalLimit(value: unknown, fallback = 500, max = 1000): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(1, Math.min(max, Math.floor(value)))
  if (typeof value === "string") return parseLimit(value, fallback, max)
  return fallback
}

async function adminGuard(req: FastifyRequest, reply: FastifyReply, options: AdminRouteOptions): Promise<void> {
  const config = getApiRuntimeConfig(req)
  const adminActivation = {
    ...(options.uiModeRuntime?.adminActivation ?? {}),
    configEnabled:
      options.uiModeRuntime?.adminActivation?.configEnabled ?? config.webui.admin?.enabled ?? false,
  }
  if (isAdminUiEnabled(adminActivation)) return
  recordAdminGuardFailure(req, options)
  await reply.status(403).send({
    ok: false,
    error: "admin_ui_disabled",
    message: "Admin UI is disabled for this runtime.",
  })
}

export function registerAdminRoute(app: FastifyInstance, options: AdminRouteOptions = {}): void {
  const adminPreHandler = [authMiddleware, (req: FastifyRequest, reply: FastifyReply) => adminGuard(req, reply, options)]

  app.get("/api/admin/runtime", { preHandler: adminPreHandler }, async (req) => {
    const config = getApiRuntimeConfig(req)
    const paths = getApiRuntimePaths(req)
    return sanitizeAdminResponse({
      ok: true,
      mode: getUiModeState({ ...(options.uiModeRuntime ?? {}), config }),
      manifest: buildRuntimeManifest(buildAdminRuntimeManifestOptions(options, config, paths)),
    })
  })

  app.get("/api/admin/shell", { preHandler: adminPreHandler }, async (req) => {
    const config = getApiRuntimeConfig(req)
    const paths = getApiRuntimePaths(req)
    return sanitizeAdminResponse({
      ok: true,
      shell: buildAdminShell(options, config, paths),
      mode: getUiModeState({ ...(options.uiModeRuntime ?? {}), config }),
      manifest: buildRuntimeManifest(buildAdminRuntimeManifestOptions(options, config, paths)),
    })
  })

  app.get<{ Querystring: AdminLiveQuerystring }>("/api/admin/live", { preHandler: adminPreHandler }, async (req) => {
    const config = getApiRuntimeConfig(req)
    const paths = getApiRuntimePaths(req)
    return buildAdminLive(req.query, options, config, paths)
  })

  app.get<{ Querystring: AdminToolLabQuerystring }>("/api/admin/tool-lab", { preHandler: adminPreHandler }, async (req) => {
    const limit = parseLimit(req.query.limit, 120, 500)
    const timeline = sanitizeTimeline(getFilteredTimeline(req.query, limit))
    const ledgerBase = listMessageLedgerEvents({
      ...(req.query.runId ? { runId: req.query.runId } : {}),
      ...(req.query.requestGroupId ? { requestGroupId: req.query.requestGroupId } : {}),
      ...(req.query.sessionKey ? { sessionKey: req.query.sessionKey } : {}),
      limit,
    }).map(sanitizeLedgerEventForAdmin)
    const ledgerEvents = filterLedgerEvents(ledgerBase, req.query)
    return sanitizeAdminResponse({
      ok: true,
      generatedAt: Date.now(),
      filters: {
        runId: req.query.runId ?? null,
        requestGroupId: req.query.requestGroupId ?? null,
        sessionKey: req.query.sessionKey ?? null,
        query: req.query.query ?? null,
        limit,
      },
      ...buildAdminToolRetrievalLab({ timeline, ledgerEvents, ...(req.query.query ? { query: req.query.query } : {}), limit }),
    })
  })

  app.get<{ Querystring: AdminLiveQuerystring }>("/api/admin/runtime-inspectors", { preHandler: adminPreHandler }, async (req) => {
    const config = getApiRuntimeConfig(req)
    const limit = parseLimit(req.query.limit, 120, 500)
    const timeline = sanitizeTimeline(getFilteredTimeline(req.query, limit))
    const ledgerBase = listMessageLedgerEvents({
      ...(req.query.runId ? { runId: req.query.runId } : {}),
      ...(req.query.requestGroupId ? { requestGroupId: req.query.requestGroupId } : {}),
      ...(req.query.sessionKey ? { sessionKey: req.query.sessionKey } : {}),
      limit,
    }).map(sanitizeLedgerEventForAdmin)
    const ledgerEvents = filterLedgerEvents(ledgerBase, req.query)
    return sanitizeAdminResponse({
      ok: true,
      generatedAt: Date.now(),
      filters: {
        runId: req.query.runId ?? null,
        requestGroupId: req.query.requestGroupId ?? null,
        sessionKey: req.query.sessionKey ?? null,
        channel: req.query.channel ?? null,
        limit,
      },
      ...buildAdminRuntimeInspectors({
        config,
        timeline,
        ledgerEvents,
        limit,
        filters: {
          ...(req.query.runId ? { runId: req.query.runId } : {}),
          ...(req.query.requestGroupId ? { requestGroupId: req.query.requestGroupId } : {}),
          ...(req.query.sessionKey ? { sessionKey: req.query.sessionKey } : {}),
          ...(req.query.channel ? { channel: req.query.channel } : {}),
        },
      }),
    })
  })

  app.get<{ Querystring: AdminLiveQuerystring }>("/api/admin/platform-inspectors", { preHandler: adminPreHandler }, async (req) => {
    const paths = getApiRuntimePaths(req)
    const limit = parseLimit(req.query.limit, 120, 500)
    const timeline = sanitizeTimeline(getFilteredTimeline(req.query, limit))
    const ledgerBase = listMessageLedgerEvents({
      ...(req.query.runId ? { runId: req.query.runId } : {}),
      ...(req.query.requestGroupId ? { requestGroupId: req.query.requestGroupId } : {}),
      ...(req.query.sessionKey ? { sessionKey: req.query.sessionKey } : {}),
      limit,
    }).map(sanitizeLedgerEventForAdmin)
    const ledgerEvents = filterLedgerEvents(ledgerBase, req.query)
    const inspectors = buildAdminPlatformInspectors({
      timeline,
      ledgerEvents,
      paths,
      limit,
      filters: {
        ...(req.query.runId ? { runId: req.query.runId } : {}),
        ...(req.query.requestGroupId ? { requestGroupId: req.query.requestGroupId } : {}),
        ...(req.query.sessionKey ? { sessionKey: req.query.sessionKey } : {}),
        ...(req.query.channel ? { channel: req.query.channel } : {}),
      },
    })
    return sanitizeAdminResponse({
      ok: true,
      generatedAt: Date.now(),
      filters: {
        runId: req.query.runId ?? null,
        requestGroupId: req.query.requestGroupId ?? null,
        sessionKey: req.query.sessionKey ?? null,
        channel: req.query.channel ?? null,
        limit,
      },
      ...inspectors,
      exports: {
        ...inspectors.exports,
        jobs: inspectors.exports.jobs.map(redactDiagnosticExportJobForAdmin),
      },
    })
  })

  app.post("/api/admin/diagnostic-exports", { preHandler: adminPreHandler }, async (req, reply) => {
    const paths = getApiRuntimePaths(req)
    const body = normalizeDiagnosticExportBody(req.body)
    const runId = optionalString(body.runId)
    const requestGroupId = optionalString(body.requestGroupId)
    const sessionKey = optionalString(body.sessionKey)
    const channel = optionalString(body.channel)
    const job = startAdminDiagnosticExport({
      ...(runId ? { runId } : {}),
      ...(requestGroupId ? { requestGroupId } : {}),
      ...(sessionKey ? { sessionKey } : {}),
      ...(channel ? { channel } : {}),
      includeTimeline: optionalBoolean(body.includeTimeline, true),
      includeReport: optionalBoolean(body.includeReport, true),
      limit: optionalLimit(body.limit),
    }, paths)
    return reply.status(202).send({ ok: true, job: redactDiagnosticExportJobForAdmin(job) })
  })

  app.get("/api/admin/diagnostic-exports", { preHandler: adminPreHandler }, async () => {
    return {
      ok: true,
      generatedAt: Date.now(),
      jobs: listAdminDiagnosticExportJobs().map(redactDiagnosticExportJobForAdmin),
    }
  })

  app.get<{ Querystring: { maxAgeMs?: string; releaseOutputDir?: string } }>("/api/admin/artifact-cleanup/preview", { preHandler: adminPreHandler }, async (req) => {
    const paths = getApiRuntimePaths(req)
    const maxAgeMs = optionalLimit(req.query.maxAgeMs, 24 * 60 * 60 * 1_000, Number.MAX_SAFE_INTEGER)
    const releaseOutputDir = optionalString(req.query.releaseOutputDir)
    const preview = previewArtifactCleanup({ paths, maxAgeMs, ...(releaseOutputDir ? { releaseOutputDir } : {}) })
    return sanitizeAdminResponse({
      ok: true,
      preview,
      display: projectArtifactCleanupForUser(preview),
    })
  })

  app.post("/api/admin/artifact-cleanup", { preHandler: adminPreHandler }, async (req, reply) => {
    const paths = getApiRuntimePaths(req)
    const body = normalizeArtifactCleanupBody(req.body)
    const confirmation = optionalString(body.confirmation) ?? ""
    const maxAgeMs = optionalLimit(body.maxAgeMs, 24 * 60 * 60 * 1_000, Number.MAX_SAFE_INTEGER)
    const releaseOutputDir = optionalString(body.releaseOutputDir)
    const execution = executeArtifactCleanup({ paths, confirmation, maxAgeMs, ...(releaseOutputDir ? { releaseOutputDir } : {}) })
    if (!execution.confirmed) return reply.status(409).send(sanitizeAdminResponse({
      ok: false,
      error: "artifact_cleanup_confirmation_required",
      execution,
      display: projectArtifactCleanupForUser(execution),
    }))
    insertAuditLog({
      timestamp: Date.now(),
      session_id: null,
      source: "webui.admin",
      tool_name: "admin.artifact_cleanup",
      params: JSON.stringify({ maxAgeMs, releaseOutputDir: releaseOutputDir ? "[explicit-release-output]" : null }),
      output: JSON.stringify({
        targets: execution.targets.map((target) => ({
          kind: target.kind,
          directoryName: target.directoryName,
          deletedFiles: target.deletedFiles,
          verifiedDeletedFiles: target.verifiedDeletedFiles,
          failedDeleteFiles: target.failedDeleteFiles,
          eligibleBytes: target.eligibleBytes,
        })),
      }),
      result: "succeeded",
      duration_ms: null,
      approval_required: 1,
      approved_by: "admin_confirmation",
    })
    return sanitizeAdminResponse({ ok: true, execution, display: projectArtifactCleanupForUser(execution) })
  })

  app.get<{ Params: { id: string } }>("/api/admin/diagnostic-exports/:id/bundle", { preHandler: adminPreHandler }, async (req, reply) => {
    const job = getAdminDiagnosticExportJob(req.params.id)
    if (!job) return reply.status(404).send({ ok: false, error: "diagnostic_export_not_found" })
    if (job.status !== "succeeded" || !job.bundlePath || !job.bundleFile) {
      return reply.status(409).send({ ok: false, error: "diagnostic_export_not_ready" })
    }
    if (!existsSync(job.bundlePath)) return reply.status(404).send({ ok: false, error: "diagnostic_export_bundle_not_found" })
    try {
      const stat = statSync(job.bundlePath)
      if (!stat.isFile() || basename(job.bundlePath) !== job.bundleFile) return reply.status(404).send({ ok: false, error: "diagnostic_export_bundle_not_found" })
    } catch {
      return reply.status(404).send({ ok: false, error: "diagnostic_export_bundle_not_found" })
    }
    reply.header("Cache-Control", "private, max-age=300")
    reply.header("Content-Disposition", `attachment; filename="${basename(job.bundleFile).replace(/"/g, "")}"`)
    reply.type("application/json")
    return reply.send(createReadStream(job.bundlePath))
  })

  app.get<{ Params: { id: string } }>("/api/admin/diagnostic-exports/:id", { preHandler: adminPreHandler }, async (req, reply) => {
    const job = getAdminDiagnosticExportJob(req.params.id)
    if (!job) return reply.status(404).send({ ok: false, error: "diagnostic_export_not_found" })
    return { ok: true, job: redactDiagnosticExportJobForAdmin(job) }
  })

  app.post("/api/admin/web-retrieval-fixtures/replay", { preHandler: adminPreHandler }, async (req) => {
    const body = normalizeFixtureReplayBody(req.body)
    return runAdminWebRetrievalFixtureReplay({ fixtureIds: normalizeFixtureIds(body.fixtureIds) })
  })

  app.post("/api/admin/actions", { preHandler: adminPreHandler }, async (req, reply) => {
    const body = normalizeActionBody(req.body)
    if (!isDangerousAction(body.action)) {
      const output = { ok: false, error: "invalid_admin_action", allowedActions: DANGEROUS_ADMIN_ACTIONS.map((action) => action.id) }
      recordAdminAudit({
        toolName: "admin.action",
        params: body,
        output,
        result: "blocked",
        errorCode: "invalid_admin_action",
        stopReason: "invalid_admin_action",
      })
      insertDiagnosticEvent({
        kind: "admin.action.invalid",
        summary: "Admin dangerous action was rejected because the action id is invalid.",
        detail: { body: sanitizeAdminAuditValue(body) as Record<string, unknown> },
      })
      return reply.status(400).send(output)
    }

    const action = body.action
    const requiredConfirmation = confirmationFor(action)
    const targetId = typeof body.targetId === "string" ? body.targetId : null
    const confirmation = typeof body.confirmation === "string" ? body.confirmation.trim() : ""
    const actionParams = { action, targetId, reason: body.reason, params: body.params }

    if (confirmation !== requiredConfirmation) {
      const output = {
        ok: false,
        error: "admin_action_confirmation_required",
        action,
        targetId,
        status: "needs_confirmation",
        requiredConfirmation,
      }
      recordAdminAudit({
        toolName: `admin.action.${action}`,
        params: actionParams,
        output,
        result: "blocked",
        approvalRequired: true,
        errorCode: "confirmation_required",
        stopReason: "missing_explicit_confirmation",
      })
      insertDiagnosticEvent({
        kind: "admin.action.confirmation_required",
        summary: "Admin dangerous action was blocked until explicit confirmation is provided.",
        detail: { action, targetId, requiredConfirmation },
      })
      return reply.status(409).send(output)
    }

    const output = {
      ok: true,
      action,
      targetId,
      status: "accepted",
      summary: `Admin action ${action} accepted after explicit confirmation.`,
    }
    recordAdminAudit({
      toolName: `admin.action.${action}`,
      params: actionParams,
      output,
      result: "accepted",
      approvalRequired: true,
      approvedBy: "explicit_confirmation",
    })
    insertDiagnosticEvent({
      kind: "admin.action.accepted",
      summary: "Admin dangerous action accepted after explicit confirmation.",
      detail: { action, targetId },
    })
    return reply.status(202).send(output)
  })

  app.all("/api/admin/*", { preHandler: adminPreHandler }, async (_req, reply) => {
    return reply.status(404).send({ ok: false, error: "admin_api_not_found" })
  })
}
