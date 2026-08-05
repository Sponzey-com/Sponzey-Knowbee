import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  authorizeRedactedPromptDisclosure,
  BEHAVIOR_POLICY_SUMMARY_CATEGORIES,
  createBehaviorPolicySummaryProjection,
  deliverVerifiedRedactedPrompt,
  PROMPT_DISCLOSURE_SENSITIVE_CATEGORIES,
  type PromptDisclosureRedactionReceipt,
} from "../packages/core/src/index.ts"

const now = Date.UTC(2026, 6, 14, 23, 30, 0)

function receipt(overrides: Partial<PromptDisclosureRedactionReceipt> = {}): PromptDisclosureRedactionReceipt {
  return {
    schemaVersion: 1, receiptId: "redaction:1", sourceFingerprint: "source:v1", redactedOutputFingerprint: "output:v1",
    policyVersion: "redaction:v1", scannedCategories: [...PROMPT_DISCLOSURE_SENSITIVE_CATEGORIES], residualCategories: [],
    replacementCount: 4, scannerSucceeded: true, verifierRef: "verifier:redactor", verifiedAt: now,
    expiresAt: now + 60_000, ...overrides,
  }
}

function authorize(overrides: Record<string, unknown> = {}) {
  return authorizeRedactedPromptDisclosure({
    expectedSourceFingerprint: "source:v1", expectedRedactedOutputFingerprint: "output:v1",
    expectedPolicyVersion: "redaction:v1", receipt: receipt(), now, ...overrides,
  })
}

describe("task1238 prompt disclosure summary and redaction", () => {
  it("creates a bounded category-only behavior summary projection", () => {
    expect(BEHAVIOR_POLICY_SUMMARY_CATEGORIES).toHaveLength(7)
    expect(createBehaviorPolicySummaryProjection({
      categories: ["identity", "response_language", "memory_isolation"], maxCategories: 4, maxRenderedCharacters: 480,
    })).toEqual({
      schemaVersion: 1, projection: "behavior_policy_summary",
      categories: ["identity", "response_language", "memory_isolation"], maxRenderedCharacters: 480,
    })
  })

  it("rejects oversized, duplicate, empty, or unclassified summary input", () => {
    expect(() => createBehaviorPolicySummaryProjection({ categories: [], maxCategories: 2, maxRenderedCharacters: 480 })).toThrow(/category count/)
    expect(() => createBehaviorPolicySummaryProjection({ categories: ["identity", "identity"], maxCategories: 2, maxRenderedCharacters: 480 })).toThrow(/unique/)
    expect(() => createBehaviorPolicySummaryProjection({ categories: ["identity", "response_language"], maxCategories: 1, maxRenderedCharacters: 480 })).toThrow(/category count/)
    expect(() => createBehaviorPolicySummaryProjection({ categories: ["raw_prompt" as never], maxCategories: 1, maxRenderedCharacters: 480 })).toThrow(/not allowed/)
  })

  it("requires all eight sensitive categories before disclosure", () => {
    expect(PROMPT_DISCLOSURE_SENSITIVE_CATEGORIES).toHaveLength(8)
    expect(authorize()).toEqual({ status: "deliverable", receiptId: "redaction:1", redactedOutputFingerprint: "output:v1" })
    expect(authorize({ receipt: receipt({ scannedCategories: PROMPT_DISCLOSURE_SENSITIVE_CATEGORIES.slice(1) }) })).toEqual({
      status: "blocked", reasonCode: "sensitive_scan_incomplete",
    })
  })

  it.each([
    [undefined, "redaction_receipt_missing"],
    [receipt({ expiresAt: now }), "redaction_receipt_expired"],
    [receipt({ sourceFingerprint: "source:old" }), "redaction_scope_mismatch"],
    [receipt({ redactedOutputFingerprint: "output:old" }), "redaction_scope_mismatch"],
    [receipt({ scannerSucceeded: false }), "scanner_failed"],
    [receipt({ residualCategories: ["token"] }), "sensitive_content_residual"],
  ] as const)("rejects unsafe redaction receipt %o", (candidate, reasonCode) => {
    expect(authorize({ receipt: candidate })).toEqual({ status: "blocked", reasonCode })
  })

  it("never delivers content rejected by redaction verification", async () => {
    const deliver = vi.fn(async () => "sent")
    await expect(deliverVerifiedRedactedPrompt({ decision: authorize({ receipt: receipt({ residualCategories: ["secret"] }) }), deliver })).resolves.toEqual({
      status: "blocked", reasonCode: "sensitive_content_residual",
    })
    expect(deliver).not.toHaveBeenCalled()
    await expect(deliverVerifiedRedactedPrompt({ decision: authorize(), deliver })).resolves.toEqual({ status: "delivered", result: "sent" })
    expect(deliver).toHaveBeenCalledTimes(1)
  })

  it("keeps summary and redaction decisions independent from external systems", () => {
    const text = readFileSync(new URL("../packages/core/src/contracts/prompt-disclosure-redaction.ts", import.meta.url), "utf8")
    expect(text).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(text).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
