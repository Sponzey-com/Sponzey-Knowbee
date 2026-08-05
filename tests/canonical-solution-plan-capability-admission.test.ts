import { describe, expect, it } from "vitest"

import {
  buildSolutionPlanCapabilityAdmission,
  recordSolutionPlanCapabilityAdmission,
  resolveOwnerScopedCapabilitySelectionTargets,
} from "../packages/core/src/runs/solution-plan-capability-admission.ts"

const base = {
  runId: "run:capability-admission",
  solutionPlanReceiptId: "receipt:solution-plan:1",
  policyReceiptId: "receipt:policy:1",
  capabilitySnapshot: {
    snapshotId: "snapshot:capability:1",
    fingerprint: `sha256:${"a".repeat(64)}` as const,
    bindings: [
      { capabilityId: "web.search", targetId: "agent:knowbee", risk: "safe" as const },
    ],
  },
  selections: [{ stepId: "research", capabilityRef: "capability:web.search" }],
  targetId: "agent:knowbee",
  approvedCapabilityIds: [] as string[],
}

describe("canonical solution-plan capability admission", () => {
  it("separates the canonical binding target from the exact external execution target", () => {
    expect(buildSolutionPlanCapabilityAdmission({
      runId: "run:external-target",
      solutionPlanReceiptId: "receipt:solution-plan:external-target",
      policyReceiptId: "receipt:policy:external-target",
      capabilitySnapshot: {
        snapshotId: "snapshot:external-target",
        fingerprint: `sha256:${"a".repeat(64)}`,
        bindings: [
          {
            capabilityId: "yeonjang_camera_capture",
            targetId: "agent:registered-owner",
            risk: "approval_required",
          },
        ],
        exclusions: [],
      },
      selections: [
        {
          stepId: "capture",
          capabilityRef: "capability:yeonjang_camera_capture",
        },
      ],
      bindingTargetId: "agent:registered-owner",
      executionTargetId: "yeonjang-main",
      approvedCapabilityIds: [],
    })).toMatchObject({
      ok: true,
      descriptor: {
        outcome: "approval_required",
        entries: [
          {
            capabilityId: "yeonjang_camera_capture",
            targetId: "yeonjang-main",
          },
        ],
      },
    })
  })

  it("binds capture and delivery selections to their own targets", () => {
    expect(buildSolutionPlanCapabilityAdmission({
      runId: "run:camera-delivery-targets",
      solutionPlanReceiptId: "receipt:solution-plan:camera-delivery-targets",
      policyReceiptId: "receipt:policy:camera-delivery-targets",
      capabilitySnapshot: {
        snapshotId: "snapshot:camera-delivery-targets",
        fingerprint: `sha256:${"c".repeat(64)}`,
        bindings: [
          {
            capabilityId: "yeonjang_camera_capture",
            targetId: "agent:camera-owner",
            risk: "approval_required",
          },
          {
            capabilityId: "telegram_send_file",
            targetId: "agent:channel-owner",
            risk: "approval_required",
          },
        ],
        exclusions: [],
      },
      selections: [
        {
          stepId: "capture",
          capabilityRef: "capability:yeonjang_camera_capture",
        },
        {
          stepId: "deliver",
          capabilityRef: "capability:telegram_send_file",
        },
      ],
      selectionTargets: {
        capture: {
          bindingTargetId: "agent:camera-owner",
          executionTargetId: "yeonjang:main",
        },
        deliver: {
          bindingTargetId: "agent:channel-owner",
          executionTargetId: "destination:telegram:current-chat",
        },
      },
      approvedCapabilityIds: [
        "yeonjang_camera_capture",
        "telegram_send_file",
      ],
    })).toMatchObject({
      ok: true,
      descriptor: {
        entries: [
          {
            stepId: "capture",
            capabilityId: "yeonjang_camera_capture",
            targetId: "yeonjang:main",
          },
          {
            stepId: "deliver",
            capabilityId: "telegram_send_file",
            targetId: "destination:telegram:current-chat",
          },
        ],
      },
    })
  })

  it("builds one deterministic, redacted receipt bound to the plan and snapshot", () => {
    const first = buildSolutionPlanCapabilityAdmission(base)
    const second = buildSolutionPlanCapabilityAdmission(base)

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      ok: true,
      descriptor: {
        runId: base.runId,
        solutionPlanReceiptId: base.solutionPlanReceiptId,
        capabilitySnapshotFingerprint: base.capabilitySnapshot.fingerprint,
        outcome: "allowed",
        entries: [
          {
            stepId: "research",
            capabilityRef: "capability:web.search",
            capabilityId: "web.search",
            targetId: "agent:knowbee",
          },
        ],
      },
    })
    expect(JSON.stringify(first)).not.toContain("raw plan")
    if (!first.ok) throw new Error(first.reasonCode)
    expect(first.descriptor.evidenceRefs.join("\n")).not.toContain("agent:knowbee")
  })

  it("rejects a selection outside the canonical snapshot", () => {
    expect(
      buildSolutionPlanCapabilityAdmission({
        ...base,
        selections: [{ stepId: "research", capabilityRef: "capability:file.read" }],
      }),
    ).toEqual({ ok: false, reasonCode: "capability_admission_outside_snapshot" })
  })

  it("rejects an ambiguous or mismatched target", () => {
    expect(
      buildSolutionPlanCapabilityAdmission({
        ...base,
        targetId: undefined,
        capabilitySnapshot: {
          ...base.capabilitySnapshot,
          bindings: [
            ...base.capabilitySnapshot.bindings,
            { capabilityId: "web.search", targetId: "agent:other", risk: "safe" as const },
          ],
        },
      }),
    ).toEqual({ ok: false, reasonCode: "capability_admission_target_ambiguous" })

    expect(
      buildSolutionPlanCapabilityAdmission({ ...base, targetId: "agent:other" }),
    ).toEqual({ ok: false, reasonCode: "capability_admission_target_unavailable" })
  })

  it("binds topology-owned tools to their one canonical owner binding", () => {
    const capabilitySnapshot = {
      ...base.capabilitySnapshot,
      bindings: [
        ...base.capabilitySnapshot.bindings,
        {
          capabilityId: "web.search",
          targetId: "agent:remote-worker",
          risk: "safe" as const,
        },
      ],
    }
    const selectionTargets = resolveOwnerScopedCapabilitySelectionTargets({
      capabilitySnapshot,
      selections: base.selections,
      ownerAgentId: "agent:knowbee",
    })

    expect(selectionTargets).toEqual({
      research: { bindingTargetId: "agent:knowbee" },
    })
    expect(buildSolutionPlanCapabilityAdmission({
      ...base,
      targetId: undefined,
      capabilitySnapshot,
      selectionTargets,
    })).toMatchObject({
      ok: true,
      descriptor: {
        entries: [{ bindingTargetId: "agent:knowbee", targetId: "agent:knowbee" }],
      },
    })
  })

  it("preserves an approval-scoped binding for the existing execution approval boundary", () => {
    const approval = {
      ...base,
      capabilitySnapshot: {
        ...base.capabilitySnapshot,
        bindings: [
          {
            capabilityId: "web.search",
            targetId: "agent:knowbee",
            risk: "approval_required" as const,
          },
        ],
      },
    }
    expect(buildSolutionPlanCapabilityAdmission(approval)).toMatchObject({
      ok: true,
      descriptor: {
        outcome: "approval_required",
        approvalRequiredCapabilityIds: ["web.search"],
      },
    })
    expect(
      buildSolutionPlanCapabilityAdmission({
        ...approval,
        approvedCapabilityIds: ["web.search"],
      }),
    ).toMatchObject({
      ok: true,
      descriptor: {
        outcome: "allowed",
        approvalRequiredCapabilityIds: [],
      },
    })
  })

  it("rejects a denied binding even when its ID was approved", () => {
    expect(
      buildSolutionPlanCapabilityAdmission({
        ...base,
        approvedCapabilityIds: ["web.search"],
        capabilitySnapshot: {
          ...base.capabilitySnapshot,
          bindings: [
            { capabilityId: "web.search", targetId: "agent:knowbee", risk: "denied" as const },
          ],
        },
      }),
    ).toEqual({ ok: false, reasonCode: "capability_admission_denied" })
  })

  it("persists exact replay idempotently and rejects a changed binding", () => {
    const built = buildSolutionPlanCapabilityAdmission(base)
    if (!built.ok) throw new Error(built.reasonCode)
    const stored = new Map<string, Record<string, unknown>>()
    const dependencies = {
      issueReceipt: (receipt: Record<string, unknown> & { receiptId: string }) => {
        if (stored.has(receipt.receiptId)) {
          return { issued: false as const, reasonCode: "receipt_already_exists" }
        }
        stored.set(receipt.receiptId, receipt)
        return { issued: true as const }
      },
      loadReceipt: (receiptId: string) => stored.get(receiptId),
    }
    expect(
      recordSolutionPlanCapabilityAdmission(built.descriptor, dependencies),
    ).toEqual({
      ok: true,
      capabilityAdmissionReceiptId: built.descriptor.receiptId,
    })
    expect(
      recordSolutionPlanCapabilityAdmission(built.descriptor, dependencies),
    ).toEqual({
      ok: true,
      capabilityAdmissionReceiptId: built.descriptor.receiptId,
    })
    const changed = {
      ...built.descriptor,
      evidenceFingerprint: `sha256:${"b".repeat(64)}` as const,
    }
    expect(recordSolutionPlanCapabilityAdmission(changed, dependencies)).toEqual({
      ok: false,
      reasonCode: "receipt_already_exists",
    })
  })
})
