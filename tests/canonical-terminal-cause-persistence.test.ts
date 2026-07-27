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
})
