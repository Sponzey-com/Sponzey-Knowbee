import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  type ExtensionLiveEvidenceRejectionCode,
  produceExtensionLiveAcceptanceEvidence,
} from "../packages/core/src/release/extension-live-acceptance-evidence.ts"
import {
  type ExtensionLiveCapability,
  type ExtensionLiveResultDiagnosisReceipt,
  type ExtensionLiveSmokeResult,
  type ExtensionLiveSmokeSummary,
  type ExtensionLiveSmokeTrace,
  type ExtensionLiveToolExecutionReceipt,
  transitionExtensionLiveSmokeState,
} from "../packages/core/src/runs/extension-live-smoke.ts"

const FINISHED_AT = Date.parse("2026-07-17T05:00:00.000Z")
const CONTEXT_FINGERPRINT = `sha256:${"a".repeat(64)}` as const
const EVIDENCE_REF = `tool-result:extension:${"b".repeat(64)}`

function toolExecution(
  capability: ExtensionLiveCapability,
  overrides: Partial<ExtensionLiveToolExecutionReceipt> = {},
): ExtensionLiveToolExecutionReceipt {
  const suffix = capability === "skill" ? "skill:weather" : "mcp:weather"
  return {
    runId: "extension-run:154",
    requestGroupId: "extension-run:154",
    capability,
    agentId: "agent:main",
    bindingId: `binding:${suffix}`,
    catalogId: suffix,
    toolName: "weather.read",
    status: "succeeded",
    executionObserved: true,
    evidenceRef: EVIDENCE_REF,
    ...overrides,
  }
}

function diagnosis(
  overrides: Partial<ExtensionLiveResultDiagnosisReceipt> = {},
): ExtensionLiveResultDiagnosisReceipt {
  return {
    diagnosedBy: "llm",
    status: "complete",
    contextFingerprint: CONTEXT_FINGERPRINT,
    criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
    evidenceRefs: [EVIDENCE_REF],
    ...overrides,
  }
}

function trace(
  capability: ExtensionLiveCapability,
  overrides: Partial<ExtensionLiveSmokeTrace> = {},
): ExtensionLiveSmokeTrace {
  const suffix = capability === "skill" ? "skill:weather" : "mcp:weather"
  return {
    requestGroupId: "extension-run:154",
    selectedCapability: capability,
    selectedAgentId: "agent:main",
    selectedBindingId: `binding:${suffix}`,
    selectedCatalogId: suffix,
    discoveryOnly: false,
    toolExecution: toolExecution(capability),
    resultDiagnosis: diagnosis(),
    auditEventId: `audit:${capability}:154`,
    redactionStatus: "verified",
    ...overrides,
  }
}

function result(
  capability: ExtensionLiveCapability,
  overrides: Partial<ExtensionLiveSmokeResult> = {},
): ExtensionLiveSmokeResult {
  const suffix = capability === "skill" ? "skill:weather" : "mcp:weather"
  return {
    scenario: {
      id: `${capability}-read-only-call`,
      capability,
      expectedAgentId: "agent:main",
      expectedBindingId: `binding:${suffix}`,
      expectedCatalogId: suffix,
      expectedToolName: "weather.read",
      readOnly: true,
    },
    state: "verified",
    status: "passed",
    trace: trace(capability),
    startedAt: FINISHED_AT - 1_000,
    finishedAt: FINISHED_AT,
    ...overrides,
  }
}

function run(results = [result("skill"), result("mcp")]): ExtensionLiveSmokeSummary {
  return {
    kind: "extension.live_smoke",
    mode: "live-run",
    runId: "extension-run:154",
    status: "passed",
    startedAt: FINISHED_AT - 2_000,
    finishedAt: FINISHED_AT,
    results,
  }
}

function rejected(
  capability: ExtensionLiveCapability,
  reasonCode: ExtensionLiveEvidenceRejectionCode,
  value: ExtensionLiveSmokeSummary,
) {
  expect(produceExtensionLiveAcceptanceEvidence(value)).toEqual({
    accepted: [],
    rejected: [{ scenarioId: `${capability}-read-only-call`, capability, reasonCode }],
  })
}

describe("Task 154 extension live evidence", () => {
  it("uses explicit non-terminal and terminal state transitions", () => {
    expect(transitionExtensionLiveSmokeState("prepared", "START")).toEqual({
      ok: true,
      state: "executing",
    })
    expect(transitionExtensionLiveSmokeState("executing", "OBSERVE")).toEqual({
      ok: true,
      state: "observed",
    })
    expect(transitionExtensionLiveSmokeState("observed", "VERIFY")).toEqual({
      ok: true,
      state: "verified",
    })
    expect(transitionExtensionLiveSmokeState("verified", "START")).toEqual({
      ok: false,
      state: "verified",
      reasonCode: "extension_smoke_transition_invalid",
    })
  })

  it("produces separate bounded Skill and MCP evidence", () => {
    expect(produceExtensionLiveAcceptanceEvidence(run())).toEqual({
      accepted: [
        {
          evidenceRef: "extension-smoke:extension-run:154:skill-read-only-call",
          capability: "skill",
          scenarioId: "skill-read-only-call",
          terminalStatus: "passed",
          auditEventId: "audit:skill:154",
          executedAt: FINISHED_AT,
          redactionStatus: "verified",
        },
        {
          evidenceRef: "extension-smoke:extension-run:154:mcp-read-only-call",
          capability: "mcp",
          scenarioId: "mcp-read-only-call",
          terminalStatus: "passed",
          auditEventId: "audit:mcp:154",
          executedAt: FINISHED_AT,
          redactionStatus: "verified",
        },
      ],
      rejected: [],
    })
  })

  it.each([
    ["extension_smoke_not_live", { mode: "dry-run" }],
    ["extension_smoke_run_not_passed", { status: "failed" }],
  ] as const)("rejects %s at run level", (reasonCode, overrides) => {
    rejected("skill", reasonCode, { ...run([result("skill")]), ...overrides })
  })

  it.each([
    ["extension_smoke_result_not_verified", { state: "observed" }],
    [
      "extension_smoke_read_only_required",
      { scenario: { ...result("skill").scenario, readOnly: false } },
    ],
    [
      "extension_smoke_selection_mismatch",
      { trace: trace("skill", { selectedAgentId: "agent:other" }) },
    ],
    [
      "extension_smoke_run_correlation_invalid",
      { trace: trace("skill", { requestGroupId: "other-run" }) },
    ],
    ["extension_smoke_discovery_only", { trace: trace("skill", { discoveryOnly: true }) }],
    ["extension_smoke_tool_receipt_missing", { trace: trace("skill", { toolExecution: null }) }],
    [
      "extension_smoke_tool_receipt_mismatch",
      {
        trace: trace("skill", {
          toolExecution: toolExecution("skill", { bindingId: "binding:other" }),
        }),
      },
    ],
    [
      "extension_smoke_tool_not_succeeded",
      {
        trace: trace("skill", {
          toolExecution: toolExecution("skill", { executionObserved: false }),
        }),
      },
    ],
    ["extension_smoke_llm_diagnosis_missing", { trace: trace("skill", { resultDiagnosis: null }) }],
    [
      "extension_smoke_llm_diagnosis_invalid",
      {
        trace: trace("skill", {
          resultDiagnosis: diagnosis({ status: "followup" }),
        }),
      },
    ],
    [
      "extension_smoke_evidence_binding_invalid",
      {
        trace: trace("skill", {
          resultDiagnosis: diagnosis({ evidenceRefs: ["foreign"] }),
        }),
      },
    ],
    ["extension_smoke_audit_missing", { trace: trace("skill", { auditEventId: "" }) }],
    ["extension_smoke_unredacted", { trace: trace("skill", { redactionStatus: "unverified" }) }],
  ] as const)("rejects %s", (reasonCode, overrides) => {
    rejected(
      "skill",
      reasonCode,
      run([result("skill", overrides as Partial<ExtensionLiveSmokeResult>)]),
    )
  })

  it("rejects duplicate scenarios instead of silently replacing them", () => {
    const production = produceExtensionLiveAcceptanceEvidence(run([result("mcp"), result("mcp")]))
    expect(production.rejected).toContainEqual({
      scenarioId: "mcp-read-only-call",
      capability: "mcp",
      reasonCode: "extension_smoke_scenario_duplicate",
    })
  })

  it("has no provider, persistence, filesystem, network, or environment access", () => {
    const source = readFileSync(
      "packages/core/src/release/extension-live-acceptance-evidence.ts",
      "utf8",
    )
    expect(source).not.toMatch(
      /process\.env|node:fs|db\/|from\s+["'][^"']*(?:provider|mcp\/client)|fetch\(/u,
    )
  })
})
