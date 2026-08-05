import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  activateAuthorizedPromptSnapshot,
  authorizeNextRunPromptActivation,
  authorizePromptSourceApplication,
  PROMPT_IMPROVEMENT_PLATFORM_IMPACTS,
  writeAuthorizedPromptSources,
  type MainAgentPlatformReviewReceipt,
  type PersistentPromptSourceDescriptor,
  type VerifiedPromptSourceApplicationReceipt,
} from "../packages/core/src/index.ts"

const now = Date.UTC(2026, 6, 14, 16, 0, 0)

function source(sourceKind: PersistentPromptSourceDescriptor["sourceKind"] = "prompt_source_file"): PersistentPromptSourceDescriptor {
  return {
    sourceKind, sourceRef: "prompt:tool_policy", baselineVersion: "v1", baselineChecksum: "sha:old",
    proposedVersion: "v2", proposedChecksum: "sha:new", rollbackRef: "rollback:v1",
  }
}

function review(overrides: Partial<MainAgentPlatformReviewReceipt> = {}): MainAgentPlatformReviewReceipt {
  return {
    schemaVersion: 1, reviewId: "review:main:1", mainAgentId: "agent:main", proposalFingerprint: "proposal:v1",
    sourceSetFingerprint: "sources:v1", invariantReviewFingerprint: "invariants:v1", decision: "approved",
    reviewedAt: now, expiresAt: now + 60_000, ...overrides,
  }
}

function application(overrides: Record<string, unknown> = {}) {
  return authorizePromptSourceApplication({
    proposalFingerprint: "proposal:v1", impact: "common_tool_policy", sourceSetFingerprint: "sources:v1",
    invariantReviewFingerprint: "invariants:v1", configuredMainAgentId: "agent:main", sources: [source()],
    mainReview: review(), now, ...overrides,
  })
}

function written(overrides: Partial<VerifiedPromptSourceApplicationReceipt> = {}): VerifiedPromptSourceApplicationReceipt {
  return {
    schemaVersion: 1, proposalFingerprint: "proposal:v1", sourceSetFingerprint: "sources:v1", written: true, verified: true,
    testsPassed: ["tests/prompt-harness-regression.test.ts"],
    writtenSourceVersions: [{ sourceRef: "prompt:tool_policy", version: "v2", checksum: "sha:new" }], ...overrides,
  }
}

function activation(overrides: Record<string, unknown> = {}) {
  return authorizeNextRunPromptActivation({
    proposalRunId: "run:proposal", activationRunId: "run:next", currentRuntimeSnapshotFingerprint: "runtime:old",
    nextRuntimeSnapshotFingerprint: "runtime:new", activationMethod: "restart", sourceApplication: written(),
    requiredTests: ["tests/prompt-harness-regression.test.ts"],
    expectedProposalFingerprint: "proposal:v1", expectedSourceSetFingerprint: "sources:v1", expectedSources: [source()], ...overrides,
  })
}

describe("task1234 platform prompt review and next-run activation", () => {
  it("defines four platform impacts and one agent-owned-only impact", () => {
    expect(PROMPT_IMPROVEMENT_PLATFORM_IMPACTS).toEqual([
      "platform_policy", "common_safety", "common_tool_policy", "common_yeonjang_policy", "agent_owned_only",
    ])
  })

  it.each(["platform_policy", "common_safety", "common_tool_policy", "common_yeonjang_policy"] as const)(
    "requires main-agent final review for %s", (impact) => {
      expect(application({ impact }).status).toBe("authorized")
      expect(application({ impact, mainReview: undefined })).toEqual({ status: "blocked", reasonCode: "main_review_missing" })
    },
  )

  it("allows agent-owned-only source application without duplicate platform review", () => {
    expect(application({ impact: "agent_owned_only", mainReview: undefined })).toMatchObject({
      status: "authorized", authorization: { impact: "agent_owned_only" },
    })
  })

  it.each([
    [{ mainAgentId: "agent:other" }, "main_review_scope_mismatch"],
    [{ decision: "denied" }, "main_review_denied"],
    [{ expiresAt: now }, "main_review_expired"],
    [{ proposalFingerprint: "proposal:other" }, "main_review_scope_mismatch"],
    [{ sourceSetFingerprint: "sources:other" }, "main_review_scope_mismatch"],
    [{ invariantReviewFingerprint: "invariants:other" }, "main_review_scope_mismatch"],
  ] as const)("rejects invalid platform review %o", (overrides, reasonCode) => {
    expect(application({ mainReview: review(overrides) })).toEqual({ status: "blocked", reasonCode })
  })

  it.each(["prompt_source_file", "persistent_prompt_record", "harness_source_file"] as const)("authorizes persistent source kind %s", (sourceKind) => {
    expect(application({ sources: [source(sourceKind)] })).toMatchObject({
      status: "authorized", authorization: { sources: [{ sourceKind }] },
    })
  })

  it.each(["memory:agent:child:short-term", "agent-memory:child:long-term", "database:unrelated:42", "db:users:42"])(
    "rejects forbidden persistence source %s before write",
    (sourceRef) => {
      expect(application({ sources: [{ ...source(), sourceRef }] })).toEqual({ status: "blocked", reasonCode: "source_ref_forbidden" })
    },
  )

  it("rejects in-memory/environment source kinds and invalid source lineage", () => {
    expect(application({ sources: [{ ...source(), sourceKind: "runtime_string" }] })).toEqual({
      status: "blocked", reasonCode: "source_kind_invalid",
    })
    expect(application({ sources: [{ ...source(), proposedVersion: "v1" }] })).toEqual({
      status: "blocked", reasonCode: "source_lineage_invalid",
    })
  })

  it("does not invoke source write without exact authorization", async () => {
    const write = vi.fn(async () => "saved")
    await expect(writeAuthorizedPromptSources({ decision: application({ mainReview: undefined }), write })).resolves.toEqual({
      status: "blocked", reasonCode: "main_review_missing",
    })
    expect(write).not.toHaveBeenCalled()
    await expect(writeAuthorizedPromptSources({
      decision: application({ sources: [{ ...source(), sourceRef: "memory:agent:child:long-term" }] }),
      write,
    })).resolves.toEqual({ status: "blocked", reasonCode: "source_ref_forbidden" })
    expect(write).not.toHaveBeenCalled()
    await expect(writeAuthorizedPromptSources({ decision: application(), write })).resolves.toEqual({ status: "written", result: "saved" })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("authorizes only a different run and different runtime snapshot", () => {
    expect(activation()).toEqual({
      status: "authorized", activation: { method: "restart", activationRunId: "run:next", nextRuntimeSnapshotFingerprint: "runtime:new" },
    })
    expect(activation({ activationRunId: "run:proposal" })).toEqual({ status: "blocked", reasonCode: "current_run_mutation" })
    expect(activation({ nextRuntimeSnapshotFingerprint: "runtime:old" })).toEqual({
      status: "blocked", reasonCode: "current_process_snapshot_mutation",
    })
  })

  it("requires verified regression tests before activating a harness source for the next run", () => {
    const harness = source("harness_source_file")
    expect(activation({ expectedSources: [harness], sourceApplication: written({
      writtenSourceVersions: [{ sourceRef: harness.sourceRef, version: harness.proposedVersion, checksum: harness.proposedChecksum }],
    }) })).toMatchObject({ status: "authorized", activation: { activationRunId: "run:next" } })
    expect(activation({ expectedSources: [harness], sourceApplication: written({
      testsPassed: [],
      writtenSourceVersions: [{ sourceRef: harness.sourceRef, version: harness.proposedVersion, checksum: harness.proposedChecksum }],
    }) })).toEqual({ status: "blocked", reasonCode: "regression_tests_missing" })
  })

  it("rejects source application and loaded source mismatches", () => {
    expect(activation({ sourceApplication: written({ testsPassed: [] }) })).toEqual({
      status: "blocked", reasonCode: "regression_tests_missing",
    })
    expect(activation({ expectedProposalFingerprint: "proposal:other" })).toEqual({
      status: "blocked", reasonCode: "source_application_scope_mismatch",
    })
    expect(activation({ sourceApplication: written({ writtenSourceVersions: [{ sourceRef: "prompt:tool_policy", version: "v3", checksum: "sha:new" }] }) })).toEqual({
      status: "blocked", reasonCode: "loaded_source_mismatch",
    })
  })

  it("does not invoke activation for a current-run or stale source decision", async () => {
    const activate = vi.fn(async () => "loaded")
    await expect(activateAuthorizedPromptSnapshot({
      decision: activation({ activationRunId: "run:proposal" }), activate,
    })).resolves.toEqual({ status: "blocked", reasonCode: "current_run_mutation" })
    expect(activate).not.toHaveBeenCalled()
    await expect(activateAuthorizedPromptSnapshot({ decision: activation(), activate })).resolves.toEqual({ status: "activated", result: "loaded" })
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it("keeps platform review and activation policy independent from external state", () => {
    const text = readFileSync(new URL("../packages/core/src/contracts/platform-prompt-activation-boundary.ts", import.meta.url), "utf8")
    expect(text).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(text).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
