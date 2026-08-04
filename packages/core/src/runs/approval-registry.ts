import crypto from "node:crypto"
import { getDb } from "../db/index.js"
import type { ApprovalDecision, ApprovalKind, ApprovalResolutionReason } from "../events/index.js"
import type { RiskLevel } from "../tools/types.js"

export type ApprovalRegistryStatus =
  | "requested"
  | "approved_once"
  | "approved_run"
  | "denied"
  | "expired"
  | "superseded"
  | "consumed"

export interface ApprovalRegistryRow {
  id: string
  run_id: string
  request_group_id: string | null
  channel: string
  channel_message_id: string | null
  tool_name: string
  risk_level: string
  kind: ApprovalKind
  status: ApprovalRegistryStatus
  params_hash: string
  params_preview_json: string | null
  requested_at: number
  expires_at: number | null
  consumed_at: number | null
  decision_at: number | null
  decision_by: string | null
  decision_source: string | null
  superseded_by: string | null
  metadata_json: string | null
  operation_id: string | null
  operation_binding_hash: string | null
  continuation_schema_version: number | null
  decision_actor_fingerprint: string | null
  created_at: number
  updated_at: number
}

export interface CreateApprovalRegistryRequestInput {
  id?: string
  runId: string
  requestGroupId?: string | null
  channel: string
  toolName: string
  riskLevel: RiskLevel | string
  kind: ApprovalKind
  params: unknown
  authorizationParams?: unknown
  expiresAt?: number | null
  channelMessageId?: string | null
  metadata?: Record<string, unknown>
  operationBinding?: ApprovalOperationBinding
  now?: number
  supersedePending?: boolean
}

export interface ApprovalOperationBinding {
  operationId: string
  operationBindingHash: `sha256:${string}`
  continuationSchemaVersion: number
}

export interface ApprovalRegistryDecisionResult {
  accepted: boolean
  status: ApprovalRegistryStatus | "missing"
  decision?: ApprovalDecision
  reason?: ApprovalResolutionReason | "late" | "already_consumed" | "superseded" | "scope_mismatch"
  row?: ApprovalRegistryRow
}

export interface ApprovalConsumptionScope {
  runId: string
  requestGroupId?: string | null
  toolName: string
  params: unknown
  authorizationParams?: unknown
  agentId?: string | null
  operationBinding?: ApprovalOperationBinding
}

export type ApprovalRegistryGrantAcquisition =
  | {
      acquired: true
      decision: "allow_once" | "allow_run"
      approvalId: string
      source: "approved" | "consumed_run"
      row: ApprovalRegistryRow
    }
  | {
      acquired: false
      reasonCode: "approval_grant_not_found" | "approval_grant_scope_mismatch"
    }

const REQUESTED_STATUSES = new Set<ApprovalRegistryStatus>(["requested"])
const APPROVED_STATUSES = new Set<ApprovalRegistryStatus>(["approved_once", "approved_run"])

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`
}

export function hashApprovalParams(params: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(params)).digest("hex")
}

export function hashApprovalDecisionActor(input: {
  channel: string
  actorId: string
}): `sha256:${string}` {
  const digest = crypto
    .createHash("sha256")
    .update(stableStringify({
      schemaVersion: 1,
      channel: input.channel.trim().toLowerCase(),
      actorId: input.actorId,
    }))
    .digest("hex")
  return `sha256:${digest}`
}

export function createApprovalRegistryRequest(input: CreateApprovalRegistryRequestInput): ApprovalRegistryRow {
  const now = input.now ?? Date.now()
  const id = input.id ?? crypto.randomUUID()
  const paramsHash = hashApprovalParams(input.authorizationParams ?? input.params)
  const preview = safeJsonPreview(input.params)
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null
  const db = getDb()

  if (input.supersedePending ?? true) {
    db.prepare(
      `UPDATE approval_registry
       SET status = 'superseded', superseded_by = ?, updated_at = ?
       WHERE run_id = ?
         AND tool_name = ?
         AND status = 'requested'`,
    ).run(id, now, input.runId, input.toolName)
  }

  db.prepare(
    `INSERT INTO approval_registry
     (id, run_id, request_group_id, channel, channel_message_id, tool_name, risk_level, kind,
      status, params_hash, params_preview_json, requested_at, expires_at, consumed_at,
      decision_at, decision_by, decision_source, superseded_by, metadata_json,
      operation_id, operation_binding_hash, continuation_schema_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL,
             ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.runId,
    input.requestGroupId ?? null,
    input.channel,
    input.channelMessageId ?? null,
    input.toolName,
    input.riskLevel,
    input.kind,
    paramsHash,
    preview,
    now,
    input.expiresAt ?? null,
    metadataJson,
    input.operationBinding?.operationId ?? null,
    input.operationBinding?.operationBindingHash ?? null,
    input.operationBinding?.continuationSchemaVersion ?? null,
    now,
    now,
  )

  return getApprovalRegistryRow(id)!
}

export function getApprovalRegistryRow(id: string): ApprovalRegistryRow | undefined {
  return getDb()
    .prepare<[string], ApprovalRegistryRow>("SELECT * FROM approval_registry WHERE id = ?")
    .get(id)
}

export function getLatestApprovalForRun(runId: string): ApprovalRegistryRow | undefined {
  return getDb()
    .prepare<[string], ApprovalRegistryRow>(
      `SELECT *
       FROM approval_registry
       WHERE run_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(runId)
}

export function getActiveApprovalForRun(runId: string): ApprovalRegistryRow | undefined {
  return getDb()
    .prepare<[string], ApprovalRegistryRow>(
      `SELECT *
       FROM approval_registry
       WHERE run_id = ?
         AND status = 'requested'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(runId)
}

export function findLatestApprovalByChannelMessage(params: {
  channel: string
  channelMessageId: string
}): ApprovalRegistryRow | undefined {
  return getDb()
    .prepare<[string, string], ApprovalRegistryRow>(
      `SELECT *
       FROM approval_registry
       WHERE channel = ?
         AND channel_message_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(params.channel, params.channelMessageId)
}

export function attachApprovalChannelMessage(approvalId: string, channelMessageId: string, now = Date.now()): boolean {
  const result = getDb()
    .prepare<[string, number, string]>(
      `UPDATE approval_registry
       SET channel_message_id = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(channelMessageId, now, approvalId)
  return result.changes > 0
}

export function attachApprovalChannelBinding(input: {
  approvalId: string
  channelMessageId: string
  decisionActorFingerprint: `sha256:${string}`
  now?: number
}): boolean {
  const result = getDb()
    .prepare<[string, string, number, string]>(
      `UPDATE approval_registry
       SET channel_message_id = ?, decision_actor_fingerprint = ?,
           updated_at = ?
       WHERE id = ? AND status = 'requested'`,
    )
    .run(
      input.channelMessageId,
      input.decisionActorFingerprint,
      input.now ?? Date.now(),
      input.approvalId,
    )
  return result.changes === 1
}

export function listRequestedApprovalsForChannelCallback(input: {
  runId: string
  channel: string
  channelMessageId: string
  decisionActorFingerprint: `sha256:${string}`
  now?: number
}): ApprovalRegistryRow[] {
  const now = input.now ?? Date.now()
  return getDb()
    .prepare<
      [string, string, string, string, number],
      ApprovalRegistryRow
    >(
      `SELECT *
       FROM approval_registry
       WHERE run_id = ?
         AND channel = ?
         AND channel_message_id = ?
         AND decision_actor_fingerprint = ?
         AND status = 'requested'
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at ASC, id ASC`,
    )
    .all(
      input.runId,
      input.channel,
      input.channelMessageId,
      input.decisionActorFingerprint,
      now,
    )
}

export function expireApprovalRegistryRequest(approvalId: string, now = Date.now()): ApprovalRegistryDecisionResult {
  const row = getApprovalRegistryRow(approvalId)
  if (!row) return { accepted: false, status: "missing", reason: "timeout" }
  if (row.status !== "requested") return { accepted: false, status: row.status, row }

  getDb().prepare(
    `UPDATE approval_registry
     SET status = 'expired', decision_at = ?, decision_source = 'timeout', updated_at = ?
     WHERE id = ?
       AND status = 'requested'`,
  ).run(now, now, approvalId)

  return { accepted: false, status: "expired", reason: "timeout", row: getApprovalRegistryRow(approvalId)! }
}

export function resolveApprovalRegistryDecision(params: {
  approvalId: string
  decision: ApprovalDecision
  decisionBy?: string | null
  decisionSource: string
  now?: number
}): ApprovalRegistryDecisionResult {
  const now = params.now ?? Date.now()
  const row = getApprovalRegistryRow(params.approvalId)
  if (!row) return { accepted: false, status: "missing" }

  if (row.expires_at !== null && row.expires_at <= now && row.status === "requested") {
    expireApprovalRegistryRequest(row.id, now)
    return { accepted: false, status: "expired", reason: "late", row: getApprovalRegistryRow(row.id)! }
  }

  if (!REQUESTED_STATUSES.has(row.status)) {
    const reason = row.status === "consumed" ? "already_consumed" : row.status === "superseded" ? "superseded" : "late"
    return { accepted: false, status: row.status, reason, row }
  }

  const status: ApprovalRegistryStatus = params.decision === "allow_run"
    ? "approved_run"
    : params.decision === "allow_once"
      ? "approved_once"
      : "denied"
  const metadata = parseApprovalMetadata(row)
  const metadataJson = JSON.stringify({
    ...metadata,
    approvalDecision: params.decision,
  })

  getDb().prepare(
    `UPDATE approval_registry
     SET status = ?, decision_at = ?, decision_by = ?, decision_source = ?,
         metadata_json = ?, updated_at = ?
     WHERE id = ?
       AND status = 'requested'`,
  ).run(
    status,
    now,
    params.decisionBy ?? null,
    params.decisionSource,
    metadataJson,
    now,
    params.approvalId,
  )

  return { accepted: true, status, decision: params.decision, row: getApprovalRegistryRow(params.approvalId)! }
}

export function consumeApprovalRegistryDecision(
  approvalId: string,
  now = Date.now(),
  expected?: ApprovalConsumptionScope,
): ApprovalRegistryDecisionResult {
  const row = getApprovalRegistryRow(approvalId)
  if (!row) return { accepted: false, status: "missing" }
  if (row.expires_at !== null && row.expires_at <= now && (row.status === "requested" || APPROVED_STATUSES.has(row.status))) {
    getDb().prepare(
      `UPDATE approval_registry
       SET status = 'expired', decision_at = ?, decision_source = 'timeout', updated_at = ?
       WHERE id = ?
         AND status IN ('requested', 'approved_once', 'approved_run')`,
    ).run(now, now, row.id)
    return { accepted: false, status: "expired", reason: "late", row: getApprovalRegistryRow(row.id)! }
  }
  if (!APPROVED_STATUSES.has(row.status)) {
    const reason = row.status === "consumed" ? "already_consumed" : row.status === "superseded" ? "superseded" : "late"
    return { accepted: false, status: row.status, reason, row }
  }

  if (expected && !approvalScopeMatches(row, expected)) {
    return { accepted: false, status: row.status, reason: "scope_mismatch", row }
  }

  getDb().prepare(
    `UPDATE approval_registry
     SET status = 'consumed', consumed_at = ?, updated_at = ?
     WHERE id = ?
       AND status IN ('approved_once', 'approved_run')`,
  ).run(now, now, approvalId)

  return {
    accepted: true,
    status: "consumed",
    decision: row.status === "approved_run" ? "allow_run" : "allow_once",
    row: getApprovalRegistryRow(approvalId)!,
  }
}

export function acquireApprovalRegistryGrant(
  expected: ApprovalConsumptionScope,
  now = Date.now(),
): ApprovalRegistryGrantAcquisition {
  const paramsHash = hashApprovalParams(
    expected.authorizationParams ?? expected.params,
  )
  const rows = getDb()
    .prepare<
      [string | null, string, string],
      ApprovalRegistryRow
    >(
      `SELECT *
       FROM approval_registry
       WHERE request_group_id IS ?
         AND tool_name = ?
         AND params_hash = ?
         AND status IN ('approved_once', 'approved_run', 'consumed')
       ORDER BY updated_at DESC, id DESC`,
    )
    .all(expected.requestGroupId ?? null, expected.toolName, paramsHash)

  let scopeMismatch = false
  for (const row of rows) {
    if (!approvalScopeMatches(row, expected)) {
      scopeMismatch = true
      continue
    }
    if (row.expires_at !== null && row.expires_at <= now) continue
    if (row.status === "consumed") {
      const metadata = parseApprovalMetadata(row)
      if (metadata.approvalDecision !== "allow_run") continue
      return {
        acquired: true,
        decision: "allow_run",
        approvalId: row.id,
        source: "consumed_run",
        row,
      }
    }
    const consumed = consumeApprovalRegistryDecision(row.id, now, expected)
    if (
      !consumed.accepted
      || !consumed.row
      || (consumed.decision !== "allow_once" && consumed.decision !== "allow_run")
    ) continue
    return {
      acquired: true,
      decision: consumed.decision,
      approvalId: row.id,
      source: "approved",
      row: consumed.row,
    }
  }
  return {
    acquired: false,
    reasonCode: scopeMismatch
      ? "approval_grant_scope_mismatch"
      : "approval_grant_not_found",
  }
}

function parseApprovalMetadata(row: ApprovalRegistryRow): Record<string, unknown> {
  try {
    const value = row.metadata_json ? JSON.parse(row.metadata_json) : {}
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function approvalScopeMatches(row: ApprovalRegistryRow, expected: ApprovalConsumptionScope): boolean {
  if (row.run_id !== expected.runId || row.tool_name !== expected.toolName) return false
  if (row.request_group_id !== (expected.requestGroupId ?? null)) return false
  if (
    row.params_hash !==
    hashApprovalParams(expected.authorizationParams ?? expected.params)
  ) return false

  const metadata = parseApprovalMetadata(row)
  const approvedAgentId = typeof metadata.agentId === "string" ? metadata.agentId : null
  if (approvedAgentId !== (expected.agentId?.trim() || null)) return false

  const binding = expected.operationBinding
  if (
    row.operation_id !== (binding?.operationId ?? null)
    || row.operation_binding_hash !== (binding?.operationBindingHash ?? null)
    || row.continuation_schema_version
      !== (binding?.continuationSchemaVersion ?? null)
  ) {
    return false
  }
  return true
}

export type ApprovalNoticeLanguage = "ko" | "en"

export function describeLateApproval(
  row: ApprovalRegistryRow | undefined,
  language: ApprovalNoticeLanguage = "ko",
): string {
  if (!row) {
    return language === "en"
      ? "No approval request was found. Run the request again if approval is still needed."
      : "처리할 승인 요청을 찾을 수 없습니다. 필요한 경우 요청을 다시 실행해 주세요."
  }
  switch (row.status) {
    case "expired":
      return language === "en"
        ? "This approval request has expired. It was not executed for safety. Run the request again to request new approval."
        : "이 승인 요청은 이미 만료되었습니다. 안전을 위해 실행하지 않았습니다. 요청을 다시 실행해 새 승인을 받아 주세요."
    case "consumed":
      return language === "en"
        ? "This approval request has already been used. The same approval cannot be reused."
        : "이 승인 요청은 이미 사용되었습니다. 같은 승인은 다시 사용할 수 없습니다."
    case "superseded":
      return language === "en"
        ? "This approval request was replaced by a newer request. Respond to the latest approval request."
        : "이 승인 요청은 더 새 요청으로 대체되었습니다. 최신 승인 요청에 응답해 주세요."
    case "denied":
      return language === "en"
        ? "This approval request was already denied. Run the request again if approval is still needed."
        : "이 승인 요청은 이미 거부되었습니다. 필요한 경우 요청을 다시 실행해 주세요."
    case "approved_once":
    case "approved_run":
      return language === "en"
        ? "This approval request has already been approved. Duplicate execution will not run."
        : "이 승인 요청은 이미 승인 처리되었습니다. 중복 실행은 하지 않습니다."
    case "requested":
      return language === "en"
        ? "This approval request is still pending. Respond from the latest approval message."
        : "승인 요청이 아직 대기 중입니다. 최신 승인 메시지에서 다시 응답해 주세요."
  }
}

function safeJsonPreview(value: unknown): string | null {
  try {
    return stableStringify(value).slice(0, 2000)
  } catch {
    return null
  }
}
