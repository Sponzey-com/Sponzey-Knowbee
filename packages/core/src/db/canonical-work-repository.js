import { CANONICAL_WORK_EVENTS, CANONICAL_WORK_STATES, transitionCanonicalWorkState, } from "../contracts/canonical-work-state.js";
export class CanonicalWorkPersistenceCorruptionError extends Error {
    reasonCode = "canonical_work_persistence_corrupt";
    constructor() {
        super("Canonical work persistence is corrupt.");
        this.name = "CanonicalWorkPersistenceCorruptionError";
    }
}
function corrupt() {
    throw new CanonicalWorkPersistenceCorruptionError();
}
function parseAggregate(row) {
    if (!row.work_id.trim() || !row.root_run_id.trim())
        corrupt();
    if (!CANONICAL_WORK_STATES.includes(row.state))
        corrupt();
    if (!Number.isSafeInteger(row.revision) || row.revision < 0)
        corrupt();
    let raw;
    try {
        raw = JSON.parse(row.transitions_json);
    }
    catch {
        corrupt();
    }
    if (!Array.isArray(raw) || raw.length !== row.revision)
        corrupt();
    const transitions = [];
    let state = "REQUEST_RECEIVED";
    for (let index = 0; index < raw.length; index += 1) {
        const value = raw[index];
        if (!value || typeof value !== "object" || Array.isArray(value))
            corrupt();
        const item = value;
        const event = item.event;
        const receiptRef = item.receiptRef;
        if (!CANONICAL_WORK_EVENTS.includes(event) || typeof receiptRef !== "string")
            corrupt();
        if (item.revision !== index + 1 || item.previousState !== state)
            corrupt();
        const decision = transitionCanonicalWorkState({
            currentState: state,
            event: event,
            receiptRef,
        });
        if (!decision.accepted || item.nextState !== decision.nextState)
            corrupt();
        const receipt = {
            revision: index + 1,
            event: decision.event,
            previousState: decision.previousState,
            nextState: decision.nextState,
            receiptRef: decision.receiptRef,
        };
        transitions.push(receipt);
        state = receipt.nextState;
    }
    if (state !== row.state)
        corrupt();
    return { workId: row.work_id, rootRunId: row.root_run_id, state, revision: row.revision, transitions };
}
function validateForWrite(aggregate) {
    parseAggregate({
        work_id: aggregate.workId,
        root_run_id: aggregate.rootRunId,
        state: aggregate.state,
        revision: aggregate.revision,
        transitions_json: JSON.stringify(aggregate.transitions),
    });
}
export class SqliteCanonicalWorkRepository {
    db;
    now;
    constructor(db, now) {
        this.db = db;
        this.now = now;
    }
    create(aggregate) {
        validateForWrite(aggregate);
        if (aggregate.revision !== 0 || aggregate.state !== "REQUEST_RECEIVED")
            corrupt();
        const at = this.now();
        const result = this.db.prepare(`
      INSERT OR IGNORE INTO canonical_work_aggregates
        (work_id, root_run_id, state, revision, transitions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(aggregate.workId, aggregate.rootRunId, aggregate.state, aggregate.revision, JSON.stringify(aggregate.transitions), at, at);
        return result.changes === 1 ? { created: true } : { created: false, reasonCode: "already_exists" };
    }
    load(workId) {
        const row = this.db.prepare(`
      SELECT work_id, root_run_id, state, revision, transitions_json
      FROM canonical_work_aggregates WHERE work_id = ?
    `).get(workId);
        return row ? parseAggregate(row) : undefined;
    }
    listRecoverable(limit = 200) {
        const boundedLimit = Math.max(1, Math.min(1_000, Math.floor(limit)));
        return this.db.prepare(`
      SELECT work_id, root_run_id, state, revision, transitions_json
      FROM canonical_work_aggregates
      WHERE state <> 'USER_REPORT'
      ORDER BY updated_at ASC, work_id ASC
      LIMIT ?
    `).all(boundedLimit).map(parseAggregate);
    }
    save(input) {
        validateForWrite(input.aggregate);
        if (input.aggregate.revision !== input.expectedRevision + 1)
            corrupt();
        const result = this.db.prepare(`
      UPDATE canonical_work_aggregates
      SET state = ?, revision = ?, transitions_json = ?, updated_at = ?
      WHERE work_id = ? AND revision = ?
    `).run(input.aggregate.state, input.aggregate.revision, JSON.stringify(input.aggregate.transitions), this.now(), input.aggregate.workId, input.expectedRevision);
        if (result.changes === 1)
            return { saved: true };
        const current = this.db.prepare("SELECT revision FROM canonical_work_aggregates WHERE work_id = ?").get(input.aggregate.workId);
        return {
            saved: false,
            reasonCode: "revision_conflict",
            currentRevision: current?.revision ?? input.expectedRevision,
        };
    }
}
//# sourceMappingURL=canonical-work-repository.js.map