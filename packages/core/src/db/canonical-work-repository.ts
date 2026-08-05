import type Database from "better-sqlite3"
import {
  CANONICAL_WORK_EVENTS,
  CANONICAL_WORK_STATES,
  transitionCanonicalWorkState,
  type CanonicalWorkEvent,
  type CanonicalWorkState,
} from "../contracts/canonical-work-state.js"
import type {
  CanonicalWorkAggregate,
  CanonicalWorkTransitionReceipt,
} from "../contracts/canonical-work-aggregate.js"
import type { CanonicalWorkRepository } from "../runs/canonical-work-transition-use-case.js"

interface CanonicalWorkRow {
  work_id: string
  root_run_id: string
  state: string
  revision: number
  transitions_json: string
}

export class CanonicalWorkPersistenceCorruptionError extends Error {
  readonly reasonCode = "canonical_work_persistence_corrupt"

  constructor() {
    super("Canonical work persistence is corrupt.")
    this.name = "CanonicalWorkPersistenceCorruptionError"
  }
}

function corrupt(): never {
  throw new CanonicalWorkPersistenceCorruptionError()
}

function parseAggregate(row: CanonicalWorkRow): CanonicalWorkAggregate {
  if (!row.work_id.trim() || !row.root_run_id.trim()) corrupt()
  if (!(CANONICAL_WORK_STATES as readonly string[]).includes(row.state)) corrupt()
  if (!Number.isSafeInteger(row.revision) || row.revision < 0) corrupt()
  let raw: unknown
  try {
    raw = JSON.parse(row.transitions_json)
  } catch {
    corrupt()
  }
  if (!Array.isArray(raw) || raw.length !== row.revision) corrupt()

  const transitions: CanonicalWorkTransitionReceipt[] = []
  let state: CanonicalWorkState = "REQUEST_RECEIVED"
  for (let index = 0; index < raw.length; index += 1) {
    const value = raw[index]
    if (!value || typeof value !== "object" || Array.isArray(value)) corrupt()
    const item = value as Record<string, unknown>
    const event = item.event
    const receiptRef = item.receiptRef
    if (!(CANONICAL_WORK_EVENTS as readonly unknown[]).includes(event) || typeof receiptRef !== "string") corrupt()
    if (item.revision !== index + 1 || item.previousState !== state) corrupt()
    const decision = transitionCanonicalWorkState({
      currentState: state,
      event: event as CanonicalWorkEvent,
      receiptRef,
    })
    if (!decision.accepted || item.nextState !== decision.nextState) corrupt()
    const receipt: CanonicalWorkTransitionReceipt = {
      revision: index + 1,
      event: decision.event,
      previousState: decision.previousState,
      nextState: decision.nextState,
      receiptRef: decision.receiptRef,
    }
    transitions.push(receipt)
    state = receipt.nextState
  }
  if (state !== row.state) corrupt()
  return { workId: row.work_id, rootRunId: row.root_run_id, state, revision: row.revision, transitions }
}

function validateForWrite(aggregate: CanonicalWorkAggregate): void {
  parseAggregate({
    work_id: aggregate.workId,
    root_run_id: aggregate.rootRunId,
    state: aggregate.state,
    revision: aggregate.revision,
    transitions_json: JSON.stringify(aggregate.transitions),
  })
}

export class SqliteCanonicalWorkRepository implements CanonicalWorkRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly now: () => number,
  ) {}

  create(aggregate: CanonicalWorkAggregate): { created: true } | { created: false; reasonCode: "already_exists" } {
    validateForWrite(aggregate)
    if (aggregate.revision !== 0 || aggregate.state !== "REQUEST_RECEIVED") corrupt()
    const at = this.now()
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO canonical_work_aggregates
        (work_id, root_run_id, state, revision, transitions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(aggregate.workId, aggregate.rootRunId, aggregate.state, aggregate.revision, JSON.stringify(aggregate.transitions), at, at)
    return result.changes === 1 ? { created: true } : { created: false, reasonCode: "already_exists" }
  }

  load(workId: string): CanonicalWorkAggregate | undefined {
    const row = this.db.prepare<[string], CanonicalWorkRow>(`
      SELECT work_id, root_run_id, state, revision, transitions_json
      FROM canonical_work_aggregates WHERE work_id = ?
    `).get(workId)
    return row ? parseAggregate(row) : undefined
  }

  listRecoverable(limit = 200): CanonicalWorkAggregate[] {
    const boundedLimit = Math.max(1, Math.min(1_000, Math.floor(limit)))
    return this.db.prepare<[number], CanonicalWorkRow>(`
      SELECT work_id, root_run_id, state, revision, transitions_json
      FROM canonical_work_aggregates
      WHERE state <> 'USER_REPORT'
      ORDER BY updated_at ASC, work_id ASC
      LIMIT ?
    `).all(boundedLimit).map(parseAggregate)
  }

  save(input: { aggregate: CanonicalWorkAggregate; expectedRevision: number }):
    { saved: true } | { saved: false; reasonCode: "revision_conflict"; currentRevision: number } {
    validateForWrite(input.aggregate)
    if (input.aggregate.revision !== input.expectedRevision + 1) corrupt()
    const result = this.db.prepare(`
      UPDATE canonical_work_aggregates
      SET state = ?, revision = ?, transitions_json = ?, updated_at = ?
      WHERE work_id = ? AND revision = ?
    `).run(
      input.aggregate.state,
      input.aggregate.revision,
      JSON.stringify(input.aggregate.transitions),
      this.now(),
      input.aggregate.workId,
      input.expectedRevision,
    )
    if (result.changes === 1) return { saved: true }
    const current = this.db.prepare<[string], { revision: number }>(
      "SELECT revision FROM canonical_work_aggregates WHERE work_id = ?",
    ).get(input.aggregate.workId)
    return {
      saved: false,
      reasonCode: "revision_conflict",
      currentRevision: current?.revision ?? input.expectedRevision,
    }
  }
}
