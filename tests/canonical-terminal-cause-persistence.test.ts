import { createRequire } from "node:module"
import { afterEach, describe, expect, it } from "vitest"
import {
  validateCanonicalWorkReceipt,
  type CanonicalTerminalCause,
} from "../packages/core/src/contracts/canonical-work-receipt.ts"
import {
  CanonicalWorkReceiptPersistenceError,
  SqliteCanonicalWorkReceiptRepository,
} from "../packages/core/src/db/canonical-work-receipt-repository.ts"
import { MIGRATIONS } from "../packages/core/src/db/migrations.ts"

type SqliteStatement = {
  run(...args: unknown[]): { changes: number }
  all(...args: unknown[]): unknown[]
  get(...args: unknown[]): unknown
}

type SqliteDatabase = {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
  close(): void
}

type BetterSqlite3Factory = new (filename: string) => SqliteDatabase

const require = createRequire(import.meta.url)
const BetterSqlite3 = require("../packages/core/node_modules/better-sqlite3") as BetterSqlite3Factory
const databases: SqliteDatabase[] = []
const fingerprint = `sha256:${"a".repeat(64)}`

function createReceiptDb(includeTerminalCause: boolean): SqliteDatabase {
  const db = new BetterSqlite3(":memory:")
  databases.push(db)
  db.exec(`
    CREATE TABLE canonical_work_receipts (
      receipt_id TEXT PRIMARY KEY,
      work_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      evidence_fingerprint TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      issued_at INTEGER NOT NULL,
      consumed_revision INTEGER
      ${includeTerminalCause ? ", terminal_cause_json TEXT" : ""}
    );
  `)
  return db
}

const terminalCause: CanonicalTerminalCause = {
  schemaVersion: 1,
  originStage: "policy_admission",
  outcomeKind: "policy_block",
  reasonCode: "approval_scope_missing",
  safeAlternativesExhausted: true,
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close()
})

describe("canonical terminal cause persistence", () => {
  it("round-trips bounded terminal cause metadata and defaults legacy null to missing evidence", () => {
    const db = createReceiptDb(true)
    const repository = new SqliteCanonicalWorkReceiptRepository(db as never, () => 1_000)

    expect(repository.issue({
      receiptId: "receipt:policy:1",
      workId: "work:1",
      kind: "policy",
      evidenceFingerprint: fingerprint,
      evidenceRefs: ["policy:evidence:1"],
      terminalCause,
    })).toEqual({ issued: true })
    expect(repository.load("receipt:policy:1")).toMatchObject({
      receiptId: "receipt:policy:1",
      terminalCause,
    })

    expect(repository.issue({
      receiptId: "receipt:legacy:1",
      workId: "work:1",
      kind: "policy",
      evidenceFingerprint: fingerprint,
      evidenceRefs: ["policy:evidence:legacy"],
    })).toEqual({ issued: true })
    expect(repository.load("receipt:legacy:1")).not.toHaveProperty("terminalCause")
  })

  it("rejects malformed, unknown-version, and oversized cause metadata", () => {
    const validReceipt = {
      receiptId: "receipt:policy:invalid",
      workId: "work:1",
      kind: "policy" as const,
      evidenceFingerprint: fingerprint,
      evidenceRefs: ["policy:evidence:invalid"],
      issuedAt: 1_000,
    }
    expect(validateCanonicalWorkReceipt({
      ...validReceipt,
      terminalCause: { ...terminalCause, schemaVersion: 2 } as never,
    })).toEqual({ ok: false, reasonCode: "receipt_invalid" })
    expect(validateCanonicalWorkReceipt({
      ...validReceipt,
      terminalCause: { ...terminalCause, reasonCode: "a".repeat(129) },
    })).toEqual({ ok: false, reasonCode: "receipt_invalid" })
    expect(validateCanonicalWorkReceipt({
      ...validReceipt,
      terminalCause: { ...terminalCause, rawText: "do not persist this" } as never,
    })).toEqual({ ok: false, reasonCode: "receipt_invalid" })

    const db = createReceiptDb(true)
    db.prepare(`
      INSERT INTO canonical_work_receipts
        (receipt_id, work_id, kind, evidence_fingerprint, evidence_refs_json, issued_at,
         consumed_revision, terminal_cause_json)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
    `).run(
      "receipt:corrupt:1",
      "work:1",
      "policy",
      fingerprint,
      JSON.stringify(["policy:evidence:corrupt"]),
      1_000,
      "{\"schemaVersion\":",
    )
    expect(() =>
      new SqliteCanonicalWorkReceiptRepository(db as never, () => 1_000)
        .load("receipt:corrupt:1"),
    ).toThrow(CanonicalWorkReceiptPersistenceError)
  })

  it("migrates the legacy receipt table with nullable terminal cause metadata", () => {
    const db = createReceiptDb(false)
    db.prepare(`
      INSERT INTO canonical_work_receipts
        (receipt_id, work_id, kind, evidence_fingerprint, evidence_refs_json, issued_at,
         consumed_revision)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
    `).run(
      "receipt:legacy:migration",
      "work:1",
      "policy",
      fingerprint,
      JSON.stringify(["policy:evidence:migration"]),
      1_000,
    )

    const migration = MIGRATIONS.find((candidate) => candidate.version === 70)
    expect(migration).toBeDefined()
    migration?.up(db as never)

    const columns = db.prepare("PRAGMA table_info(canonical_work_receipts)").all()
      .map((row) => (row as { name: string }).name)
    expect(columns).toContain("terminal_cause_json")
    expect(db.prepare(`
      SELECT terminal_cause_json
      FROM canonical_work_receipts
      WHERE receipt_id = ?
    `).get("receipt:legacy:migration")).toEqual({ terminal_cause_json: null })
  })

  it("migrates the receipt kind constraint to persist blocked result evidence", () => {
    const db = new BetterSqlite3(":memory:")
    databases.push(db)
    db.exec(`
      CREATE TABLE canonical_work_aggregates (
        work_id TEXT PRIMARY KEY
      );
      INSERT INTO canonical_work_aggregates (work_id) VALUES ('work:1');
      CREATE TABLE canonical_work_receipts (
        receipt_id TEXT PRIMARY KEY,
        work_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN (
          'diagnosis', 'analysis_revision', 'policy', 'execution', 'attempt',
          'verification', 'recovery', 'input_requirement', 'user_input',
          'exhaustion', 'cancellation', 'delivery'
        )),
        evidence_fingerprint TEXT NOT NULL,
        evidence_refs_json TEXT NOT NULL,
        issued_at INTEGER NOT NULL,
        consumed_revision INTEGER,
        terminal_cause_json TEXT
      );
    `)
    db.prepare(`
      INSERT INTO canonical_work_receipts
        (receipt_id, work_id, kind, evidence_fingerprint, evidence_refs_json, issued_at,
         consumed_revision, terminal_cause_json)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
    `).run(
      "receipt:policy:before-blocker",
      "work:1",
      "policy",
      fingerprint,
      JSON.stringify(["policy:evidence:before-blocker"]),
      1_000,
      JSON.stringify(terminalCause),
    )

    const migration = MIGRATIONS.find((candidate) => candidate.version === 71)
    expect(migration).toBeDefined()
    migration?.up(db as never)

    const repository = new SqliteCanonicalWorkReceiptRepository(db as never, () => 2_000)
    expect(repository.issue({
      receiptId: "receipt:blocker:1",
      workId: "work:1",
      kind: "blocker",
      evidenceFingerprint: fingerprint,
      evidenceRefs: ["blocker:evidence:1"],
      terminalCause: {
        schemaVersion: 1,
        originStage: "result_diagnosis",
        outcomeKind: "blocked",
        reasonCode: "verified_result_blocker",
        safeAlternativesExhausted: false,
      },
    })).toEqual({ issued: true })
    expect(repository.load("receipt:policy:before-blocker")).toMatchObject({
      kind: "policy",
      terminalCause,
    })
  })

  it("migrates approval state and receipt constraints without losing existing evidence", () => {
    const db = new BetterSqlite3(":memory:")
    databases.push(db)
    db.exec(`
      CREATE TABLE root_runs (id TEXT PRIMARY KEY);
      INSERT INTO root_runs (id) VALUES ('run:approval:migration');
      CREATE TABLE canonical_work_aggregates (
        work_id TEXT PRIMARY KEY,
        root_run_id TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL CHECK(state IN (
          'REQUEST_RECEIVED', 'SOLUTION_ANALYZED', 'POLICY_VALIDATED', 'EXECUTING',
          'RESULT_REVIEW', 'SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'USER_INPUT_REQUIRED',
          'BLOCKED', 'EXHAUSTED', 'CANCELLED', 'USER_REPORT'
        )),
        revision INTEGER NOT NULL CHECK(revision >= 0),
        transitions_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (root_run_id) REFERENCES root_runs(id) ON DELETE CASCADE
      );
      INSERT INTO canonical_work_aggregates
        (work_id, root_run_id, state, revision, transitions_json, created_at, updated_at)
      VALUES
        ('work:approval:migration', 'run:approval:migration', 'EXECUTING', 3, '[]', 1, 1);
      CREATE TABLE canonical_work_receipts (
        receipt_id TEXT PRIMARY KEY,
        work_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN (
          'diagnosis', 'analysis_revision', 'policy', 'execution', 'attempt',
          'verification', 'recovery', 'input_requirement', 'user_input',
          'exhaustion', 'cancellation', 'delivery', 'blocker'
        )),
        evidence_fingerprint TEXT NOT NULL,
        evidence_refs_json TEXT NOT NULL,
        issued_at INTEGER NOT NULL,
        consumed_revision INTEGER CHECK(consumed_revision IS NULL OR consumed_revision > 0),
        terminal_cause_json TEXT,
        FOREIGN KEY (work_id) REFERENCES canonical_work_aggregates(work_id) ON DELETE CASCADE
      );
      INSERT INTO canonical_work_receipts
        (receipt_id, work_id, kind, evidence_fingerprint, evidence_refs_json, issued_at,
         consumed_revision, terminal_cause_json)
      VALUES
        ('receipt:policy:preserved', 'work:approval:migration', 'policy',
         '${fingerprint}', '["policy:evidence:preserved"]', 1, 3, NULL);
    `)

    const migration = MIGRATIONS.find((candidate) => candidate.version === 73)
    expect(migration).toBeDefined()
    migration?.up(db as never)

    expect(db.prepare(`
      SELECT state, revision
      FROM canonical_work_aggregates
      WHERE work_id = 'work:approval:migration'
    `).get()).toEqual({ state: "EXECUTING", revision: 3 })
    expect(db.prepare(`
      SELECT kind, consumed_revision
      FROM canonical_work_receipts
      WHERE receipt_id = 'receipt:policy:preserved'
    `).get()).toEqual({ kind: "policy", consumed_revision: 3 })

    db.prepare(`
      UPDATE canonical_work_aggregates
      SET state = 'AWAITING_APPROVAL'
      WHERE work_id = 'work:approval:migration'
    `).run()
    const repository = new SqliteCanonicalWorkReceiptRepository(db as never, () => 2_000)
    expect(repository.issue({
      receiptId: "receipt:approval:migrated",
      workId: "work:approval:migration",
      kind: "approval",
      evidenceFingerprint: fingerprint,
      evidenceRefs: ["approval:evidence:migrated"],
    })).toEqual({ issued: true })
  })
})
