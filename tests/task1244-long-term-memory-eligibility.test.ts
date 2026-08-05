import { describe, expect, it } from "vitest"
import {
  LONG_TERM_MEMORY_CATEGORIES,
  validateLongTermMemoryWriteGate,
  type LongTermMemoryWriteGateInput,
} from "../packages/core/src/index.ts"

function input(overrides: Partial<LongTermMemoryWriteGateInput> = {}): LongTermMemoryWriteGateInput {
  return {
    targetOwner: { ownerType: "knowbee", ownerId: "agent:main" },
    category: "approved_work_context",
    storageNeed: "durable_user_fact",
    sensitivity: "not_sensitive",
    userIntent: "admin_review_approved",
    sourceEvidenceRefs: ["evidence:review:1"],
    retentionPurpose: "retain an approved durable context",
    ...overrides,
  }
}

describe("task1244 long-term memory eligibility", () => {
  it.each(LONG_TERM_MEMORY_CATEGORIES)("allows the durable category %s with approval evidence", (category) => {
    expect(validateLongTermMemoryWriteGate(input({ category }))).toMatchObject({ ok: true, category })
  })

  it.each([
    ["category", "raw_tool_result", "category_invalid"],
    ["storageNeed", "temporary_chat", "storage_need_invalid"],
    ["sensitivity", "unknown", "sensitivity_invalid"],
    ["userIntent", "implicit_assumption", "user_intent_invalid"],
  ] as const)("rejects runtime values outside the %s allowlist", (field, value, issueCode) => {
    const decision = validateLongTermMemoryWriteGate(input({ [field]: value } as Partial<LongTermMemoryWriteGateInput>))
    expect(decision).toMatchObject({ ok: false, issueCodes: expect.arrayContaining([issueCode]) })
  })

  it("rejects missing approval evidence and an owner mismatch", () => {
    expect(validateLongTermMemoryWriteGate(input({ sourceEvidenceRefs: [] })).issueCodes).toContain("source_evidence_missing")
    expect(validateLongTermMemoryWriteGate(input(), { expectedOwner: { ownerType: "sub_agent", ownerId: "agent:reviewer" } }).issueCodes).toContain("target_owner_mismatch")
  })
})
