import { describe, expect, it } from "vitest"
import {
  type LlmCapabilitySelectionDecision,
  admitLlmCapabilitySelection,
  createLlmCapabilitySelectionReceipt,
} from "../packages/core/src/contracts/llm-capability-selection.ts"
import { projectCanonicalCapabilitySnapshot } from "../packages/core/src/runs/canonical-capability-snapshot.ts"
import { appLaunchTool } from "../packages/core/src/tools/builtin/app.ts"
import { fileWriteTool } from "../packages/core/src/tools/builtin/file.ts"
import { shellExecTool } from "../packages/core/src/tools/builtin/shell.ts"
import { screenCaptureTool } from "../packages/core/src/tools/builtin/ui/screen.ts"
import { webFetchTool } from "../packages/core/src/tools/builtin/web-fetch.ts"
import { requiresApprovalAtExecutionBoundary } from "../packages/core/src/tools/dispatcher.ts"
import type { AnyTool } from "../packages/core/src/tools/types.ts"

const registry = {
  generatedAt: 1,
  agents: [],
  teams: [],
  membershipEdges: [],
  diagnostics: [],
}

const externalApiTool: AnyTool = {
  name: "external_market_api",
  description: "Retrieve an allowed market API response.",
  parameters: { type: "object", properties: {} },
  riskLevel: "safe",
  requiresApproval: false,
  evidenceSourceKind: "web",
  execute: async () => ({ success: true, output: "value=1" }),
}

const fingerprint = `sha256:${"d".repeat(64)}` as const

function externalApiDecision(): LlmCapabilitySelectionDecision {
  return {
    schemaVersion: 1,
    runId: "run:98",
    capabilitySnapshotId: "snapshot:98",
    capabilitySnapshotFingerprint: fingerprint,
    comparedBindings: [{ capabilityId: "external_market_api", targetId: "agent:knowbee" }],
    bindingAssessments: [
      {
        capabilityId: "external_market_api",
        targetId: "agent:knowbee",
        roleFit: "fit",
        permission: "allowed",
        sideEffect: "read",
        evidenceQuality: "direct",
        dataExposure: "external_private",
        externalTransfer: true,
        cost: "low",
        strategyFingerprint: "strategy:external-market-api:v1",
        changedFromFailedStrategies: true,
        reason: "The API directly provides the requested market value.",
      },
    ],
    selectedBinding: {
      capabilityId: "external_market_api",
      targetId: "agent:knowbee",
    },
    reason: "Use the allowed direct API when external transfer is permitted.",
  }
}

function admitExternalApi(externalTransferAllowed: boolean) {
  const decision = externalApiDecision()
  return admitLlmCapabilitySelection({
    runId: "run:98",
    userMethodSpecified: false,
    externalTransferAllowed,
    maxCost: "low",
    failedStrategyFingerprints: [],
    capabilitySnapshot: {
      snapshotId: "snapshot:98",
      fingerprint,
      bindings: [
        {
          capabilityId: "external_market_api",
          targetId: "agent:knowbee",
          risk: "safe",
        },
      ],
    },
    decision,
    receipt: createLlmCapabilitySelectionReceipt({ receiptId: "selection:98", decision }),
  })
}

describe("Task 098 web, local, and device execution means", () => {
  it("projects web document and allowed external API means without web search", () => {
    const snapshot = projectCanonicalCapabilitySnapshot({
      actionCapabilityIds: [],
      registry,
      tools: [webFetchTool, externalApiTool],
      source: "webui",
    })

    expect(snapshot.bindings).toEqual(
      expect.arrayContaining(
        ["web_fetch", "external_market_api"].map((capabilityId) => ({
          capabilityId,
          targetId: "agent:knowbee",
          risk: "safe",
        })),
      ),
    )
    expect(snapshot.bindings.map((binding) => binding.capabilityId)).not.toContain("web_search")
    expect(admitExternalApi(true)).toMatchObject({ status: "allowed" })
  })

  it("rejects an external API selection when external transfer is not allowed", () => {
    expect(admitExternalApi(false)).toMatchObject({
      status: "rejected",
      reasonCodes: ["external_transfer_not_allowed"],
    })
  })

  it("projects file, command, application, and device tools with approval boundaries", () => {
    const tools = [fileWriteTool, shellExecTool, appLaunchTool, screenCaptureTool]
    const snapshot = projectCanonicalCapabilitySnapshot({
      actionCapabilityIds: [],
      registry,
      tools,
    })

    expect(snapshot.bindings).toEqual(
      expect.arrayContaining([
        { capabilityId: "file_write", targetId: "agent:knowbee", risk: "approval_required" },
        { capabilityId: "shell_exec", targetId: "agent:knowbee", risk: "approval_required" },
        { capabilityId: "app_launch", targetId: "agent:knowbee", risk: "approval_required" },
        { capabilityId: "screen_capture", targetId: "agent:knowbee", risk: "approval_required" },
      ]),
    )
    for (const tool of tools) {
      expect(
        requiresApprovalAtExecutionBoundary({
          tool,
          approvalMode: "off",
          capabilityApprovalRequired: false,
        }),
      ).toBe(true)
    }
  })
})
