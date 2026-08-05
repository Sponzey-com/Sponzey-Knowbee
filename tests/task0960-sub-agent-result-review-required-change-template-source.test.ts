import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { reviewSubAgentResult } from "../packages/core/src/agent/sub-agent-result-review.ts"
import { CONTRACT_SCHEMA_VERSION } from "../packages/core/src/contracts/index.ts"
import type {
  ExpectedOutputContract,
  ResultReport,
  RuntimeIdentity,
} from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

function identity(): RuntimeIdentity {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    entityType: "sub_session",
    entityId: "sub:review",
    owner: { ownerType: "sub_agent", ownerId: "agent:researcher" },
    idempotencyKey: "idem:sub:review",
    auditCorrelationId: "audit:sub:review",
  }
}

const expectedAnswer: ExpectedOutputContract = {
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

const expectedArtifact: ExpectedOutputContract = {
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

function report(overrides: Partial<ResultReport> = {}): ResultReport {
  return {
    identity: identity(),
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

describe("task0960 sub-agent result review required-change prompt source", () => {
  it("registers required-change templates as an internal English prompt source", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const source = registry.find((item) =>
      item.sourceId === "sub_agent_result_review_required_changes_user" && item.locale === "en"
    )

    expect(source).toMatchObject({
      sourceId: "sub_agent_result_review_required_changes_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.content).toContain("## Value")
    expect(source?.content).toContain("required_output_missing=Submit required output")
    expect(source?.content).toContain("## Out Of Scope")
  })

  it("renders required-change directives from prompt source templates", () => {
    expect(reviewSubAgentResult({
      resultReport: report({ outputs: [], evidence: [] }),
      expectedOutputs: [expectedAnswer],
    }).requiredChanges).toContain("Submit required output answer with status=satisfied.")

    expect(reviewSubAgentResult({
      resultReport: report({ evidence: [] }),
      expectedOutputs: [expectedAnswer],
    }).requiredChanges).toContain("Attach explicit evidence kind source for answer.")

    expect(reviewSubAgentResult({
      resultReport: report({ status: "failed" }),
      expectedOutputs: [],
    }).requiredChanges).toContain("Retry the delegated work and return a non-failed ResultReport.")

    expect(reviewSubAgentResult({
      resultReport: report({ outputs: [], evidence: [], artifacts: [] }),
      expectedOutputs: [expectedArtifact],
    }).requiredChanges).toContain("Attach the required artifact for artifact.")

    expect(reviewSubAgentResult({
      resultReport: report({
        impossibleReason: {
          kind: "external_dependency",
          reasonCode: "source_unavailable",
          explanation: "The external source is unavailable.",
        },
      }),
      expectedOutputs: [],
    }).requiredChanges).toContain(
      "Review the structured impossible reason and decide whether the parent can integrate a limited success.",
    )
  })

  it("does not keep required-change directive bodies hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/agent/sub-agent-result-review.ts", "utf-8")

    expect(source).toContain("sub_agent_result_review_required_changes_user")
    expect(source).not.toContain("Submit required output ${issue.outputId")
    expect(source).not.toContain("Revise output ${issue.outputId")
    expect(source).not.toContain("Attach explicit evidence kind ${issue.evidenceKind")
    expect(source).not.toContain("Provide non-empty sourceRef for evidence kind")
    expect(source).not.toContain("Resolve the reported risk or gap")
    expect(source).not.toContain("Review the structured impossible reason")
    expect(source).not.toContain("Retry the delegated work and return a non-failed ResultReport.")
    expect(source).not.toContain("Return a completed ResultReport after addressing the typed completion criteria.")
  })
})
