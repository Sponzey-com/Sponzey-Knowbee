import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CONTRACT_SCHEMA_VERSION } from "../packages/core/src/contracts/index.js"
import type {
  AgentPromptBundle,
  CommandRequest,
  ExpectedOutputContract,
  MemoryPolicy,
  PermissionProfile,
  ResultReport,
  RuntimeIdentity,
  SkillMcpAllowlist,
  StructuredTaskScope,
} from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import {
  decideSubSessionCompletionIntegration,
  getSubAgentResultRetryBudgetLimit,
  reviewSubAgentResult,
} from "../packages/core/src/agent/sub-agent-result-review.ts"
import { createTestDbRuntimeFixture, type TestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

let dbRuntime: TestDbRuntimeFixture
beforeEach(() => { dbRuntime = createTestDbRuntimeFixture("knowbee-sub-agent-review-") })
afterEach(() => { dbRuntime.dispose() })
import {
  buildSubSessionFeedbackCycleDirective,
} from "../packages/core/src/runs/review-cycle-pass.ts"
import {
  canRetrySubSessionRevision,
  getSubSessionRevisionBudgetLimit,
} from "../packages/core/src/runs/recovery-budget.ts"
import {
  SubSessionRunner,
  createTextResultReport,
} from "../packages/core/src/orchestration/sub-session-runner.ts"
import type { LlmDiagnosisProvider } from "../packages/core/src/contracts/llm-diagnosis-provider.ts"
import type { LlmDiagnosisSchemaRepairProvider } from "../packages/core/src/contracts/llm-diagnosis-schema-repair-provider.ts"
import type { LlmResultDiagnosisRecord } from "../packages/core/src/contracts/work-record.ts"

const now = Date.UTC(2026, 3, 20, 0, 0, 0)

const missingEvidenceResultDiagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "The child result is missing required source evidence.",
  sufficiency: "partial",
  missing_information: ["missing_evidence:answer:source"],
  conflicts: [],
  risk: "none",
  risks: [],
  confidence: "high",
  recommended_action: "retry",
  reason: "The parent review requires source evidence before integration.",
}

class StaticResultDiagnosisProvider implements LlmDiagnosisProvider, LlmDiagnosisSchemaRepairProvider {
  constructor(private readonly resultDiagnosis: LlmResultDiagnosisRecord) {}

  diagnoseRequest(): unknown {
    throw new Error("request diagnosis is not used by this test")
  }

  diagnoseResult(): unknown {
    return this.resultDiagnosis
  }

  repairDiagnosis(): unknown {
    return this.resultDiagnosis
  }
}

function identity(entityType: RuntimeIdentity["entityType"], entityId: string): RuntimeIdentity {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    entityType,
    entityId,
    owner: { ownerType: "sub_agent", ownerId: "agent:researcher" },
    idempotencyKey: `idem:${entityId}`,
    auditCorrelationId: `audit:${entityId}`,
    parent: {
      parentRunId: "run-parent",
      parentRequestId: "request-parent",
    },
  }
}

const evidenceOutput: ExpectedOutputContract = {
  outputId: "answer",
  kind: "text",
  description: "Source-backed answer.",
  required: true,
  acceptance: {
    requiredEvidenceKinds: ["source"],
    artifactRequired: false,
    reasonCodes: ["source_backed_answer"],
  },
}

const artifactOutput: ExpectedOutputContract = {
  outputId: "artifact",
  kind: "artifact",
  description: "Generated artifact.",
  required: true,
  acceptance: {
    requiredEvidenceKinds: [],
    artifactRequired: true,
    reasonCodes: ["artifact_exists"],
  },
}

const taskScope: StructuredTaskScope = {
  goal: "Return a reviewed sub-agent result.",
  intentType: "review",
  actionType: "sub_agent_result_review",
  constraints: ["Use typed completion criteria only."],
  expectedOutputs: [evidenceOutput],
  reasonCodes: ["review_required"],
}

const allowlist: SkillMcpAllowlist = {
  enabledSkillIds: ["research"],
  enabledMcpServerIds: ["browser"],
  enabledToolNames: ["web_search"],
  disabledToolNames: [],
}

const permissionProfile: PermissionProfile = {
  profileId: "profile:safe",
  riskCeiling: "moderate",
  approvalRequiredFrom: "moderate",
  allowExternalNetwork: true,
  allowFilesystemWrite: false,
  allowShellExecution: false,
  allowScreenControl: false,
  allowedPaths: [],
}

const memoryPolicy: MemoryPolicy = {
  owner: { ownerType: "sub_agent", ownerId: "agent:researcher" },
  visibility: "private",
  readScopes: [{ ownerType: "sub_agent", ownerId: "agent:researcher" }],
  writeScope: { ownerType: "sub_agent", ownerId: "agent:researcher" },
  retentionPolicy: "short_term",
  writebackReviewRequired: true,
}

function resultReport(overrides: Partial<ResultReport> = {}): ResultReport {
  return {
    identity: identity("sub_session", "sub:review"),
    resultReportId: "result:review",
    parentRunId: "run-parent",
    subSessionId: "sub:review",
    status: "completed",
    outputs: [{
      outputId: "answer",
      status: "satisfied",
      value: "42",
    }],
    evidence: [{
      evidenceId: "evidence:source",
      kind: "source",
      sourceRef: "https://example.test/source",
      sourceTimestamp: "2026-04-20T00:00:00Z",
    }],
    artifacts: [],
    risksOrGaps: [],
    ...overrides,
  }
}

function command(id: string, expectedOutputs: ExpectedOutputContract[] = [evidenceOutput]): CommandRequest {
  return {
    identity: identity("sub_session", `sub:${id}`),
    commandRequestId: `command:${id}`,
    parentRunId: "run-parent",
    subSessionId: `sub:${id}`,
    targetAgentId: "agent:researcher",
    taskScope: { ...taskScope, expectedOutputs },
    contextPackageIds: [],
    expectedOutputs,
  }
}

function promptBundle(): AgentPromptBundle {
  return {
    identity: identity("sub_session", "prompt-bundle:researcher"),
    bundleId: "prompt-bundle:researcher",
    agentId: "agent:researcher",
    agentType: "sub_agent",
    role: "research worker",
    personalitySnapshot: "Precise",
    teamContext: [],
    memoryPolicy,
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: allowlist,
      rateLimit: { maxConcurrentCalls: 2 },
    },
    modelProfileSnapshot: {
      providerId: "openai",
      modelId: "gpt-5.4-mini",
    },
    taskScope,
    safetyRules: ["Do not deliver sub-session results directly to the user."],
    sourceProvenance: [{ sourceId: "profile:agent:researcher", version: "1" }],
    createdAt: now,
  }
}

describe("task007 sub-agent result review", () => {
  it("rejects completed reports when required evidence is missing and creates feedback", () => {
    const review = reviewSubAgentResult({
      resultReport: resultReport({ evidence: [] }),
      expectedOutputs: [evidenceOutput],
      now: () => now,
      idProvider: () => "feedback-1",
    })

    expect(review.accepted).toBe(false)
    expect(review.status).toBe("needs_revision")
    expect(review.normalizedFailureKey).toBe("sub_agent_result_review:required_evidence_missing:answer:source:none")
    expect(review.feedbackRequest).toMatchObject({
      feedbackRequestId: "feedback-1",
      parentRunId: "run-parent",
      subSessionId: "sub:review",
      missingItems: ["missing_evidence:answer:source"],
      reasonCode: "sub_agent_result_review:required_evidence_missing:answer:source:none",
    })
  })

  it("accepts only typed output and evidence criteria without semantic similarity", () => {
    const accepted = reviewSubAgentResult({
      resultReport: resultReport({
        outputs: [{ outputId: "answer", status: "satisfied", value: "The wording can be anything." }],
        evidence: [{ evidenceId: "e-1", kind: "source", sourceRef: "source:1" }],
      }),
      expectedOutputs: [evidenceOutput],
    })
    const wrongEvidenceKind = reviewSubAgentResult({
      resultReport: resultReport({
        outputs: [{ outputId: "answer", status: "satisfied", value: "42" }],
        evidence: [{ evidenceId: "e-2", kind: "quote", sourceRef: "source:2" }],
      }),
      expectedOutputs: [evidenceOutput],
    })

    expect(accepted.status).toBe("completed")
    expect(accepted.accepted).toBe(true)
    expect(wrongEvidenceKind.status).toBe("needs_revision")
    expect(wrongEvidenceKind.issues.map((issue) => issue.code)).toContain("required_evidence_missing")
  })

  it("checks artifact existence through explicit artifact state", () => {
    const review = reviewSubAgentResult({
      resultReport: resultReport({
        outputs: [{ outputId: "artifact", status: "satisfied", value: "artifact ready" }],
        evidence: [],
        artifacts: [{ artifactId: "artifact-1", kind: "image", path: "/tmp/missing.png" }],
      }),
      expectedOutputs: [artifactOutput],
      artifactExists: () => false,
    })

    expect(review.status).toBe("needs_revision")
    expect(review.missingItems).toContain("artifact_not_found:artifact-1")
  })

  it("stops repeated identical review failures instead of looping", () => {
    const first = reviewSubAgentResult({
      resultReport: resultReport({ evidence: [] }),
      expectedOutputs: [evidenceOutput],
      strategyFingerprint: "strategy:web-search-v1",
    })
    const second = reviewSubAgentResult({
      resultReport: resultReport({ evidence: [] }),
      expectedOutputs: [evidenceOutput],
      previousFailureKeys: [first.normalizedFailureKey ?? ""],
      strategyFingerprint: "strategy:web-search-v1",
      previousAttempts: [{
        normalizedFailureKey: first.normalizedFailureKey ?? "",
        strategyFingerprint: "strategy:web-search-v1",
      }],
    })

    expect(first.status).toBe("needs_revision")
    expect(second.status).toBe("failed")
    expect(second.repeatedFailure).toBe(true)
    expect(second.manualActionReason).toBe("same_sub_agent_result_review_failure_repeated")
    expect(second.feedbackRequest).toBeUndefined()
  })

  it("allows the same missing criterion when the execution strategy changed", () => {
    const first = reviewSubAgentResult({
      resultReport: resultReport({ evidence: [] }),
      expectedOutputs: [evidenceOutput],
      strategyFingerprint: "strategy:web-search-v1",
    })
    const second = reviewSubAgentResult({
      resultReport: resultReport({ evidence: [] }),
      expectedOutputs: [evidenceOutput],
      previousFailureKeys: [first.normalizedFailureKey ?? ""],
      strategyFingerprint: "strategy:direct-source-v2",
      previousAttempts: [{
        normalizedFailureKey: first.normalizedFailureKey ?? "",
        strategyFingerprint: "strategy:web-search-v1",
      }],
    })

    expect(second.status).toBe("needs_revision")
    expect(second.repeatedFailure).toBe(false)
    expect(second.canRetry).toBe(true)
    expect(second.feedbackRequest).toBeDefined()
  })

  it("uses bounded retry budgets for each result-review class", () => {
    expect(getSubAgentResultRetryBudgetLimit("default")).toBe(Number.MAX_SAFE_INTEGER)
    expect(getSubAgentResultRetryBudgetLimit("format_only")).toBe(Number.MAX_SAFE_INTEGER)
    expect(getSubAgentResultRetryBudgetLimit("risk_or_external")).toBe(Number.MAX_SAFE_INTEGER)
    expect(getSubAgentResultRetryBudgetLimit("expensive")).toBe(Number.MAX_SAFE_INTEGER)
    expect(getSubSessionRevisionBudgetLimit("format_only")).toBe(Number.MAX_SAFE_INTEGER)
    expect(canRetrySubSessionRevision({ budgetClass: "expensive" })).toBe(true)
    expect(canRetrySubSessionRevision({ budgetClass: "default", repeatedFailure: true })).toBe(false)
  })

  it("builds a concrete feedback cycle directive from FeedbackRequest", () => {
    const review = reviewSubAgentResult({
      resultReport: resultReport({ evidence: [] }),
      expectedOutputs: [evidenceOutput],
      idProvider: () => "feedback-directive",
    })
    const directive = buildSubSessionFeedbackCycleDirective(review.feedbackRequest!)

    expect(directive.kind).toBe("retry_sub_session")
    expect(directive.normalizedFailureKey).toBe(review.normalizedFailureKey)
    expect(directive.followupPrompt).toContain("Return a new ResultReport")
    expect(directive.followupPrompt).toContain("missing_evidence:answer:source")
  })

  it("prevents parent final integration until every sub-session result is accepted", () => {
    const accepted = reviewSubAgentResult({
      resultReport: resultReport(),
      expectedOutputs: [evidenceOutput],
    })
    const rejected = reviewSubAgentResult({
      resultReport: resultReport({ evidence: [] }),
      expectedOutputs: [evidenceOutput],
    })

    expect(decideSubSessionCompletionIntegration([
      { subSessionId: "sub:accepted", review: accepted },
      { subSessionId: "sub:rejected", review: rejected },
    ])).toMatchObject({
      finalDeliveryAllowed: false,
      blockedSubSessionIds: ["sub:rejected"],
    })
    expect(decideSubSessionCompletionIntegration([
      { subSessionId: "sub:accepted", review: accepted },
    ])).toMatchObject({ finalDeliveryAllowed: true })
  })

  it("connects typed review to SubSessionRunner lifecycle", async () => {
    const sessions = new Map<string, { status: string }>()
    const events: string[] = []
    const diagnosisProvider = new StaticResultDiagnosisProvider(missingEvidenceResultDiagnosis)
    const runner = new SubSessionRunner({
      now: () => now,
      idProvider: () => "runner-id",
      diagnosisProvider,
      diagnosisRepairProvider: diagnosisProvider,
      loadSubSessionByIdempotencyKey: () => undefined,
      persistSubSession: (subSession) => {
        sessions.set(subSession.subSessionId, {
          status: subSession.status,
        })
        return true
      },
      updateSubSession: (subSession) => {
        sessions.set(subSession.subSessionId, {
          status: subSession.status,
        })
      },
      appendParentEvent: (_runId, label) => {
        events.push(label)
      },
      isParentCancelled: () => false,
    })

    const outcome = await runner.runSubSession({
      command: command("runner"),
      agent: { agentId: "agent:researcher", displayName: "Researcher" },
      parentSessionId: "session-parent",
      promptBundle: promptBundle(),
    }, async (input) => createTextResultReport({
      command: input.command,
      text: "looks complete but has no evidence",
    }))

    expect(outcome.status).toBe("needs_revision")
    expect(outcome.feedbackRequest?.missingItems).toEqual(["missing_evidence:answer:source"])
    expect(sessions.get("sub:runner")).toMatchObject({ status: "needs_revision" })
    expect(events).toEqual(expect.arrayContaining([
      "sub_session_result:sub:runner:needs_revision",
      "sub_session_feedback_requested:sub:runner:sub_agent_result_review:required_evidence_missing:answer:source:none",
    ]))
  })
})
