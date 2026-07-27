import type Database from "better-sqlite3"

import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js"
import type { CapabilityAdmissionEvidenceReader } from "../channels/live-smoke-decision-receipts.js"

interface ReceiptIdRow {
  receipt_id: string
}

export class SqliteCapabilityAdmissionEvidenceReader
  implements CapabilityAdmissionEvidenceReader
{
  constructor(private readonly db: Database.Database) {}

  readForRun(runId: string): string | undefined {
    const normalizedRunId = runId.trim()
    if (!normalizedRunId) return undefined
    const capabilityReceiptPrefix =
      `receipt:capability-admission:${normalizedRunId}:%`
    const intakePolicyEvidencePrefix =
      `plan-policy-decision:${normalizedRunId}:%`
    const row = this.db
      .prepare<[string, string, string], ReceiptIdRow>(`
        SELECT receipt_id
        FROM canonical_work_receipts
        WHERE work_id = ?
          AND kind = 'policy'
          AND (
            receipt_id LIKE ?
            OR EXISTS (
              SELECT 1
              FROM json_each(canonical_work_receipts.evidence_refs_json)
              WHERE json_each.value LIKE ?
            )
          )
        ORDER BY issued_at DESC
        LIMIT 1
      `)
      .get(
        canonicalWorkIdForRootRun(normalizedRunId),
        capabilityReceiptPrefix,
        intakePolicyEvidencePrefix,
      )
    return row?.receipt_id
  }
}
