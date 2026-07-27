import type Database from "better-sqlite3"
import {
  type SideEffectOperationEvent,
  type SideEffectOperationReceipt,
  type SideEffectOperationState,
  buildSideEffectOperationIdentity,
  transitionSideEffectOperation,
  validateSideEffectOperationReceipt,
} from "../contracts/side-effect-operation.js"
import type {
  SideEffectOperationAggregate,
  SideEffectOperationRepository,
  SideEffectOperationTransitionRecord,
} from "../runs/side-effect-operation-use-case.js"

interface Row {
  operation_id: string
  scope_id: string
  run_id: string
  work_id: string
  step_key: string
  adapter_id: string
  target_fingerprint: `sha256:${string}`
  params_fingerprint: `sha256:${string}`
  state: SideEffectOperationState
  revision: number
  transitions_json: string
}

interface ReceiptRow {
  receipt_id: string
  operation_id: string
  work_id: string
  event: SideEffectOperationEvent
  kind: SideEffectOperationReceipt["kind"]
  schema_version: 1
  evidence_fingerprint: `sha256:${string}`
  evidence_refs_json: string
  operation_revision: number
  issued_at: number
}

function corrupt(): never {
  throw new Error("side_effect_operation_persistence_corrupt")
}

function hydrate(row: Row): SideEffectOperationAggregate {
  const identity = buildSideEffectOperationIdentity({
    runId: row.run_id,
    workId: row.work_id,
    stepKey: row.step_key,
    adapterId: row.adapter_id,
    targetFingerprint: row.target_fingerprint,
    paramsFingerprint: row.params_fingerprint,
  })
  if (identity.operationId !== row.operation_id || identity.scopeId !== row.scope_id) corrupt()
  let raw: unknown
  try {
    raw = JSON.parse(row.transitions_json)
  } catch {
    corrupt()
  }
  if (!Array.isArray(raw) || raw.length !== row.revision) corrupt()
  let state: SideEffectOperationState = "RESERVED"
  const transitions: SideEffectOperationTransitionRecord[] = []
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index] as Partial<SideEffectOperationTransitionRecord>
    if (
      !item ||
      typeof item !== "object" ||
      item.revision !== index + 1 ||
      item.previousState !== state
    )
      corrupt()
    const decision = transitionSideEffectOperation({
      state,
      event: item.event as SideEffectOperationEvent,
      receiptRef: typeof item.receiptRef === "string" ? item.receiptRef : "",
    })
    if (!decision.accepted || item.nextState !== decision.nextState) corrupt()
    const record: SideEffectOperationTransitionRecord = {
      revision: index + 1,
      previousState: decision.previousState,
      event: decision.event,
      nextState: decision.nextState,
      receiptRef: decision.receiptRef,
    }
    transitions.push(record)
    state = record.nextState
  }
  if (state !== row.state) corrupt()
  return { identity, state, revision: row.revision, transitions }
}

function hydrateReceipt(row: ReceiptRow): SideEffectOperationReceipt {
  let evidenceRefs: unknown
  try {
    evidenceRefs = JSON.parse(row.evidence_refs_json)
  } catch {
    corrupt()
  }
  if (!Array.isArray(evidenceRefs) || evidenceRefs.some((value) => typeof value !== "string")) {
    corrupt()
  }
  return {
    schemaVersion: row.schema_version,
    receiptId: row.receipt_id,
    operationId: row.operation_id,
    workId: row.work_id,
    event: row.event,
    kind: row.kind,
    evidenceFingerprint: row.evidence_fingerprint,
    evidenceRefs: evidenceRefs as string[],
    operationRevision: row.operation_revision,
    issuedAt: row.issued_at,
  }
}

export class SqliteSideEffectOperationRepository implements SideEffectOperationRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly now: () => number,
  ) {}

  loadByScope(scopeId: string): SideEffectOperationAggregate | undefined {
    const row = this.db
      .prepare<[string], Row>("SELECT * FROM side_effect_operations WHERE scope_id = ?")
      .get(scopeId)
    return row ? hydrate(row) : undefined
  }

  listByRun(runId: string, limit = 200): SideEffectOperationAggregate[] {
    const bounded = Math.max(1, Math.min(1_000, Math.floor(limit)))
    return this.db
      .prepare<[string, number], Row>(`
      SELECT * FROM side_effect_operations
      WHERE run_id = ?
      ORDER BY updated_at ASC, operation_id ASC
      LIMIT ?
    `)
      .all(runId, bounded)
      .map(hydrate)
  }

  loadReceipt(receiptId: string): SideEffectOperationReceipt | undefined {
    const row = this.db
      .prepare<[string], ReceiptRow>(`
      SELECT * FROM side_effect_operation_receipts WHERE receipt_id = ?
    `)
      .get(receiptId)
    if (!row) return undefined
    const receipt = hydrateReceipt(row)
    const operationRow = this.db
      .prepare<[string], Row>("SELECT * FROM side_effect_operations WHERE operation_id = ?")
      .get(receipt.operationId)
    if (!operationRow) corrupt()
    const operation = hydrate(operationRow)
    const transition = operation.transitions[receipt.operationRevision - 1]
    const validation = validateSideEffectOperationReceipt({
      receipt,
      identity: operation.identity,
      event: receipt.event,
      operationRevision: receipt.operationRevision,
    })
    if (
      !validation.ok ||
      transition?.event !== receipt.event ||
      transition.receiptRef !== receipt.receiptId
    ) {
      corrupt()
    }
    return receipt
  }

  create(
    aggregate: SideEffectOperationAggregate,
  ): { created: true } | { created: false; reasonCode: "scope_conflict" } {
    if (
      aggregate.state !== "RESERVED" ||
      aggregate.revision !== 0 ||
      aggregate.transitions.length !== 0
    )
      corrupt()
    const now = this.now()
    const result = this.db
      .prepare(`
      INSERT OR IGNORE INTO side_effect_operations
        (operation_id, scope_id, run_id, work_id, step_key, adapter_id, target_fingerprint,
         params_fingerprint, state, revision, transitions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RESERVED', 0, '[]', ?, ?)
    `)
      .run(
        aggregate.identity.operationId,
        aggregate.identity.scopeId,
        aggregate.identity.runId,
        aggregate.identity.workId,
        aggregate.identity.stepKey,
        aggregate.identity.adapterId,
        aggregate.identity.targetFingerprint,
        aggregate.identity.paramsFingerprint,
        now,
        now,
      )
    return result.changes === 1
      ? { created: true }
      : { created: false, reasonCode: "scope_conflict" }
  }

  saveTransition(input: {
    aggregate: SideEffectOperationAggregate
    expectedRevision: number
    receipt: SideEffectOperationReceipt
  }):
    | { saved: true }
    | {
        saved: false
        reasonCode: "revision_conflict" | "receipt_conflict" | "receipt_invalid"
        currentRevision: number
      } {
    const validation = validateSideEffectOperationReceipt({
      receipt: input.receipt,
      identity: input.aggregate.identity,
      event: input.aggregate.transitions.at(-1)?.event ?? input.receipt.event,
      operationRevision: input.aggregate.revision,
    })
    if (!validation.ok) {
      return {
        saved: false,
        reasonCode: "receipt_invalid",
        currentRevision: input.expectedRevision,
      }
    }
    const commit = this.db.transaction(() => {
      const inserted = this.db
        .prepare(`
        INSERT OR IGNORE INTO side_effect_operation_receipts
          (receipt_id, operation_id, work_id, event, kind, schema_version, evidence_fingerprint,
           evidence_refs_json, operation_revision, issued_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .run(
          input.receipt.receiptId,
          input.receipt.operationId,
          input.receipt.workId,
          input.receipt.event,
          input.receipt.kind,
          input.receipt.schemaVersion,
          input.receipt.evidenceFingerprint,
          JSON.stringify(input.receipt.evidenceRefs),
          input.receipt.operationRevision,
          input.receipt.issuedAt,
        )
      if (inserted.changes !== 1) return "receipt_conflict" as const
      const updated = this.db
        .prepare(`
        UPDATE side_effect_operations
        SET state = ?, revision = ?, transitions_json = ?, updated_at = ?
        WHERE operation_id = ? AND scope_id = ? AND revision = ?
      `)
        .run(
          input.aggregate.state,
          input.aggregate.revision,
          JSON.stringify(input.aggregate.transitions),
          this.now(),
          input.aggregate.identity.operationId,
          input.aggregate.identity.scopeId,
          input.expectedRevision,
        )
      if (updated.changes !== 1) throw new Error("side_effect_revision_conflict")
      return "saved" as const
    })
    try {
      const result = commit()
      if (result === "saved") return { saved: true }
      return {
        saved: false,
        reasonCode: result,
        currentRevision:
          this.loadByScope(input.aggregate.identity.scopeId)?.revision ?? input.expectedRevision,
      }
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "side_effect_revision_conflict")
        throw error
      return {
        saved: false,
        reasonCode: "revision_conflict",
        currentRevision:
          this.loadByScope(input.aggregate.identity.scopeId)?.revision ?? input.expectedRevision,
      }
    }
  }
}
