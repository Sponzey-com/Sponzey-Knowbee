import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { SqliteCapabilityAdmissionEvidenceReader } from "../packages/core/src/db/capability-admission-evidence-reader.ts"
import { closeDb, getDb } from "../packages/core/src/db/index.js"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.js"

const tempDirs: string[] = []

function createDatabase(): ReturnType<typeof getDb> {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-capability-evidence-"))
  tempDirs.push(rootDir)
  const runtime = createTestRuntimeConfigFixture({ rootDir })
  const db = initializeTestDbRuntime(runtime.paths.stateDir)
  db.pragma("foreign_keys = OFF")
  return db
}

function issuePolicyReceipt(
  db: ReturnType<typeof getDb>,
  input: {
    receiptId: string
    workId: string
    evidenceRefs: string[]
    issuedAt: number
  },
): void {
  db.prepare(`
    INSERT INTO canonical_work_receipts (
      receipt_id,
      work_id,
      kind,
      evidence_fingerprint,
      evidence_refs_json,
      issued_at
    ) VALUES (?, ?, 'policy', ?, ?, ?)
  `).run(
    input.receiptId,
    input.workId,
    `sha256:${"a".repeat(64)}`,
    JSON.stringify(input.evidenceRefs),
    input.issuedAt,
  )
}

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("SQLite capability admission evidence reader", () => {
  it("accepts the canonical intake policy receipt used by a policy-method execution scope", () => {
    const db = createDatabase()
    issuePolicyReceipt(db, {
      receiptId: "receipt:policy:run:live:intake",
      workId: "work:root:run:live",
      evidenceRefs: ["plan-policy-decision:run:live:fingerprint"],
      issuedAt: 1,
    })

    expect(
      new SqliteCapabilityAdmissionEvidenceReader(db).readForRun("run:live"),
    ).toBe("receipt:policy:run:live:intake")
  })

  it("does not mistake a recovery policy receipt for capability admission", () => {
    const db = createDatabase()
    issuePolicyReceipt(db, {
      receiptId: "receipt:policy:run:live:recovery",
      workId: "work:root:run:live",
      evidenceRefs: ["recovery-strategy:run:live:changed-tool"],
      issuedAt: 2,
    })

    expect(
      new SqliteCapabilityAdmissionEvidenceReader(db).readForRun("run:live"),
    ).toBeUndefined()
  })
})
