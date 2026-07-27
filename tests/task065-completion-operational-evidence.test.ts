import { describe, expect, it, vi } from "vitest"
import {
  buildCompletionReviewContextReceipt,
  buildCompletionReviewEvidenceBlock,
} from "../packages/core/src/agent/completion-review.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  buildCompletionReviewOperationalEvidence,
  runReviewPass,
} from "../packages/core/src/runs/review-pass.ts"

const operationalEvidence = {
  artifacts: [
    {
      artifactRef: "artifact:file:/workspace/report.csv",
      targetRef: "channel:telegram:chat-7",
      observedAt: "2026-07-16T12:00:00.000Z",
      receiptRef: "delivery:telegram:receipt-7",
    },
  ],
  stateChanges: [
    {
      stateRef: "state:filesystem:report.csv",
      targetRef: "file:/workspace/report.csv",
      observedAt: "2026-07-16T11:59:59.000Z",
      status: "observed",
    },
  ],
  deliveries: [
    {
      deliveryRef: "delivery:telegram:receipt-7",
      targetRef: "channel:telegram:chat-7",
      observedAt: "2026-07-16T12:00:00.000Z",
      status: "satisfied",
    },
  ],
} as const

describe("Task 065 completion operational evidence", () => {
  it("projects artifacts, observed state and delivery results as bound untrusted evidence", () => {
    const block = buildCompletionReviewEvidenceBlock([], operationalEvidence)
    const receipt = buildCompletionReviewContextReceipt({
      originalRequest: "Create and send report.csv",
      latestAssistantMessage: "The report was sent.",
      successfulTools: [],
      operationalEvidence,
    })

    expect(block).toContain("artifact:file:/workspace/report.csv")
    expect(block).toContain("state:filesystem:report.csv")
    expect(block).toContain("delivery:telegram:receipt-7")
    expect(block).toContain('"policyAuthority":"none"')
    expect(receipt.evidenceRefs).toEqual(
      expect.arrayContaining([
        "artifact:file:/workspace/report.csv",
        "state:filesystem:report.csv",
        "delivery:telegram:receipt-7",
      ]),
    )
  })

  it("passes runtime artifacts, mutation state and delivery outcome into the LLM review port", async () => {
    const reviewTaskCompletion = vi.fn().mockResolvedValue(null)

    await runReviewPass(
      {
        executionProfile: { approvalRequired: false, approvalTool: "none" },
        originalRequest: "Create and send report.csv",
        preview: "The report was sent.",
        priorAssistantMessages: [],
        config: DEFAULT_CONFIG,
        usesWorkerRuntime: false,
        requiresPrivilegedToolExecution: false,
        successfulTools: [],
        completionConditions: ["report.csv exists and was delivered"],
        successfulFileDeliveries: [
          {
            toolName: "send_file",
            channel: "telegram",
            filePath: "/workspace/report.csv",
            messageId: "message-7",
          },
        ],
        sawRealFilesystemMutation: true,
        deliveryOutcome: {
          mode: "direct_artifact",
          directArtifactDeliveryRequested: true,
          hasSuccessfulArtifactDelivery: true,
          deliverySatisfied: true,
          requiresDirectArtifactRecovery: false,
        },
      },
      { reviewTaskCompletion },
    )

    expect(reviewTaskCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        operationalEvidence: expect.objectContaining({
          artifacts: [expect.objectContaining({ artifactRef: "file:/workspace/report.csv" })],
          stateChanges: [expect.objectContaining({ status: "observed" })],
          deliveries: [expect.objectContaining({ status: "satisfied" })],
        }),
      }),
    )
  })

  it("does not report a pre-review ordinary reply as a failed delivery", () => {
    const evidence = buildCompletionReviewOperationalEvidence({
      successfulFileDeliveries: [],
      sawRealFilesystemMutation: false,
      deliveryOutcome: {
        mode: "reply",
        directArtifactDeliveryRequested: false,
        hasSuccessfulArtifactDelivery: false,
        hasSuccessfulTextDelivery: false,
        textDeliverySatisfied: false,
        deliverySatisfied: false,
        requiresDirectArtifactRecovery: false,
      },
    })

    expect(evidence.deliveries).toEqual([])
  })

  it("keeps successful capture evidence separate from failed direct artifact delivery", () => {
    const evidence = buildCompletionReviewOperationalEvidence({
      successfulFileDeliveries: [],
      sawRealFilesystemMutation: false,
      deliveryOutcome: {
        mode: "direct_artifact",
        directArtifactDeliveryRequested: true,
        hasSuccessfulArtifactDelivery: false,
        deliverySatisfied: false,
        requiresDirectArtifactRecovery: true,
      },
    })

    expect(evidence.artifacts).toEqual([])
    expect(evidence.deliveries).toEqual([{
      deliveryRef: "delivery-outcome:direct_artifact",
      targetRef: "delivery-mode:direct_artifact",
      status: "unsatisfied",
    }])
  })
})
