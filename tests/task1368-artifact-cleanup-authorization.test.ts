import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  CLEANUP_ARTIFACT_KINDS,
  CLEANUP_REFERENCE_SCOPES,
  PROTECTED_CLEANUP_DATA_KINDS,
  authorizeArtifactCleanup,
  deleteAuthorizedArtifact,
  type CleanupCandidateReceipt,
  type CleanupProtectedDataReceipt,
  type ArtifactCleanupReferenceReceipt,
} from "../packages/core/src/contracts/artifact-cleanup-authorization.ts"

const now = 10_000

function candidate(overrides: Partial<CleanupCandidateReceipt> = {}): CleanupCandidateReceipt {
  return {
    artifactId: "artifact:legacy-prompt",
    kind: "prompt",
    canonicalPath: "prompts/legacy.md",
    checksum: "sha:legacy",
    owner: "prompt-maintenance",
    scannerId: "cleanup-scanner:v1",
    observedUnusedAt: 9_000,
    unusedEvidenceRefs: ["usage-index:none", "registry-index:none"],
    ...overrides,
  }
}

function references(overrides: Partial<ArtifactCleanupReferenceReceipt> = {}): ArtifactCleanupReferenceReceipt[] {
  return CLEANUP_REFERENCE_SCOPES.map((scope) => ({
    artifactId: "artifact:legacy-prompt",
    scope,
    snapshotId: "snapshot:1368",
    checkedAt: 9_900,
    status: "clear",
    evidenceRef: `reference:${scope}:clear`,
    ...overrides,
  }))
}

const unprotected: CleanupProtectedDataReceipt = {
  artifactId: "artifact:legacy-prompt",
  classification: "unprotected",
  active: false,
  retentionDisposition: "not_applicable",
  evidenceRef: "classification:unprotected",
}

function decision(overrides: Partial<Parameters<typeof authorizeArtifactCleanup>[0]> = {}) {
  return authorizeArtifactCleanup({
    candidate: candidate(),
    references: references(),
    protectedData: unprotected,
    expectedSnapshotId: "snapshot:1368",
    now,
    maxReferenceAgeMs: 500,
    ...overrides,
  })
}

describe("task1368 artifact cleanup authorization", () => {
  it.each(CLEANUP_ARTIFACT_KINDS)("authorizes evidenced unused %s cleanup", async (kind) => {
    const remove = vi.fn(async () => kind)
    const authorized = decision({ candidate: candidate({ kind }) })
    await expect(deleteAuthorizedArtifact({ decision: authorized, writerArtifactId: "artifact:legacy-prompt", writerChecksum: "sha:legacy", remove }))
      .resolves.toEqual({ status: "deleted", result: kind })
    expect(remove).toHaveBeenCalledOnce()
  })

  it("rejects missing, duplicate, and future unused evidence", () => {
    expect(decision({ candidate: candidate({ unusedEvidenceRefs: ["only-one"] }) })).toEqual({ status: "blocked", reasonCode: "unused_evidence_insufficient" })
    expect(decision({ candidate: candidate({ unusedEvidenceRefs: ["same", "same"] }) })).toEqual({ status: "blocked", reasonCode: "unused_evidence_insufficient" })
    expect(decision({ candidate: candidate({ observedUnusedAt: now + 1 }) })).toEqual({ status: "blocked", reasonCode: "cleanup_candidate_invalid" })
  })

  it.each(CLEANUP_REFERENCE_SCOPES)("requires a current clear %s reference receipt", (scope) => {
    expect(decision({ references: references().filter((receipt) => receipt.scope !== scope) }))
      .toEqual({ status: "blocked", reasonCode: "reference_receipt_missing", scope })
    expect(decision({ references: references().map((receipt) => receipt.scope === scope ? { ...receipt, snapshotId: "snapshot:old" } : receipt) }))
      .toEqual({ status: "blocked", reasonCode: "reference_snapshot_mismatch", scope })
    expect(decision({ references: references().map((receipt) => receipt.scope === scope ? { ...receipt, checkedAt: 9_000 } : receipt) }))
      .toEqual({ status: "blocked", reasonCode: "reference_receipt_stale", scope })
    expect(decision({ references: references().map((receipt) => receipt.scope === scope ? { ...receipt, status: "referenced" } : receipt) }))
      .toEqual({ status: "blocked", reasonCode: "artifact_still_referenced", scope })
  })

  it.each(PROTECTED_CLEANUP_DATA_KINDS)("blocks retained protected data %s without exact approval", async (classification) => {
    const remove = vi.fn()
    const denied = decision({ protectedData: { ...unprotected, classification, active: true, retentionDisposition: "retained" } })
    expect(denied).toEqual({ status: "blocked", reasonCode: "protected_data_retained" })
    await deleteAuthorizedArtifact({ decision: denied, writerArtifactId: "artifact:legacy-prompt", writerChecksum: "sha:legacy", remove })
    expect(remove).not.toHaveBeenCalled()
  })

  it.each(PROTECTED_CLEANUP_DATA_KINDS)("allows expired or exactly approved protected data %s", (classification) => {
    const protectedData = { ...unprotected, classification, active: false, retentionDisposition: "expired" as const }
    expect(decision({ protectedData })).toMatchObject({ status: "authorized" })
    expect(decision({
      protectedData: { ...protectedData, active: true, retentionDisposition: "retained" },
      approval: { artifactId: "artifact:legacy-prompt", checksum: "sha:legacy", approvedBy: "user:owner", approvalRef: "approval:1368" },
    })).toMatchObject({ status: "authorized" })
  })

  it("blocks a cleanup writer for another artifact or checksum", async () => {
    const remove = vi.fn()
    const authorized = decision()
    await expect(deleteAuthorizedArtifact({ decision: authorized, writerArtifactId: "artifact:other", writerChecksum: "sha:legacy", remove }))
      .resolves.toEqual({ status: "blocked", reasonCode: "cleanup_writer_mismatch" })
    await expect(deleteAuthorizedArtifact({ decision: authorized, writerArtifactId: "artifact:legacy-prompt", writerChecksum: "sha:other", remove }))
      .resolves.toEqual({ status: "blocked", reasonCode: "cleanup_writer_mismatch" })
    expect(remove).not.toHaveBeenCalled()
  })

  it("uses only injected cleanup inventories and policy receipts", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/artifact-cleanup-authorization.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|unlink|rmSync|fetch\(|globalThis/u)
  })
})
