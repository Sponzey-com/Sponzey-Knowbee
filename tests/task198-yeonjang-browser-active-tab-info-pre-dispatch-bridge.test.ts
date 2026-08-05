import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import { buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria } from "../packages/core/src/release/yeonjang-browser-active-tab-info-backend-acceptance-criteria.ts"
import {
  buildYeonjangBrowserActiveTabInfoAdmissionGateProjection,
  buildYeonjangBrowserActiveTabInfoPreDispatchBridgePlan,
  evaluateYeonjangBrowserActiveTabInfoAdmissionGate,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-pre-dispatch-bridge.ts"
import { buildYeonjangBrowserActiveTabInfoRustInventoryContract } from "../packages/core/src/release/yeonjang-browser-active-tab-info-rust-inventory-contract.ts"

const READY_TARGET = {
  publicTargetName: "Office Mac",
  platform: "macos" as const,
  method: "browser.active_tab_info" as const,
  requiresApproval: true,
  permissionSetting: "allow_browser_read" as const,
}

const APPROVAL = {
  method: "browser.active_tab_info" as const,
  publicTargetName: "Office Mac",
  approvalScope: "allow_once" as const,
  approvedAt: "2026-07-22T05:00:00.000Z",
  nonce: "approval-nonce-123",
}

const APPROVAL_NOW = "2026-07-22T05:00:01.000Z"

const REDACTED_PROJECTION = projectYeonjangBrowserActiveTabInfo({
  browserName: "Google Chrome",
  title: "Private Ticket",
  url: "https://example.test/account?token=private",
  observationStatus: "available",
})

describe("Task 198 Yeonjang browser.active_tab_info pre-dispatch bridge", () => {
  it("evaluates explicit authorization receipts before runtime admission", () => {
    expect(
      evaluateYeonjangBrowserActiveTabInfoAdmissionGate({
        readyTarget: READY_TARGET,
        now: "2026-07-22T05:00:01.000Z",
      }),
    ).toMatchObject({
      status: "missing_receipt",
      reasonCode: "active_tab_info_approval_receipt_missing",
      invokeNow: false,
    })

    expect(
      evaluateYeonjangBrowserActiveTabInfoAdmissionGate({
        readyTarget: READY_TARGET,
        approvalReceipt: { ...APPROVAL, approvalScope: "deny" },
        now: "2026-07-22T05:00:01.000Z",
      }),
    ).toMatchObject({
      status: "denied",
      reasonCode: "active_tab_info_approval_denied",
      invokeNow: false,
    })

    expect(
      evaluateYeonjangBrowserActiveTabInfoAdmissionGate({
        readyTarget: READY_TARGET,
        approvalReceipt: { ...APPROVAL, publicTargetName: "Other Mac" },
        now: "2026-07-22T05:00:01.000Z",
      }),
    ).toMatchObject({
      status: "target_mismatch",
      reasonCode: "active_tab_info_approval_target_mismatch",
      invokeNow: false,
    })

    expect(
      evaluateYeonjangBrowserActiveTabInfoAdmissionGate({
        readyTarget: READY_TARGET,
        approvalReceipt: APPROVAL,
        now: "2026-07-22T05:11:00.000Z",
        maxAgeMs: 60_000,
      }),
    ).toMatchObject({
      status: "expired",
      reasonCode: "active_tab_info_approval_expired",
      invokeNow: false,
    })

    expect(
      evaluateYeonjangBrowserActiveTabInfoAdmissionGate({
        readyTarget: READY_TARGET,
        approvalReceipt: APPROVAL,
        now: "2026-07-22T05:00:01.000Z",
      }),
    ).toMatchObject({
      status: "approved",
      reasonCode: "active_tab_info_approval_admitted",
      method: "browser.active_tab_info",
      publicTargetName: "Office Mac",
      approvalScope: "allow_once",
      invokeNow: false,
    })
  })

  it("projects admission gate results without raw receipt internals or browser data", () => {
    const gate = evaluateYeonjangBrowserActiveTabInfoAdmissionGate({
      readyTarget: READY_TARGET,
      approvalReceipt: {
        ...APPROVAL,
        rawActiveTab: {
          title: "Private Ticket",
          url: "https://example.test/private?token=secret",
          profilePath: "/Users/example/Profile 1",
          windowId: "window-private",
          tabId: "tab-private",
        },
        backendFamily: "accessibility_api",
        internalInstanceId: "internal-private-instance",
      } as unknown as typeof APPROVAL,
      now: "2026-07-22T05:00:01.000Z",
    })
    const projection = buildYeonjangBrowserActiveTabInfoAdmissionGateProjection(gate)

    expect(projection).toEqual({
      status: "approved",
      reasonLabel: "Active tab read approval is ready.",
      nextActionLabel: "Continue with pre-dispatch checks.",
      method: "browser.active_tab_info",
      publicTargetName: "Office Mac",
    })

    const publicJson = JSON.stringify(projection)
    expect(publicJson).not.toContain("approval-nonce-123")
    expect(publicJson).not.toContain("Private Ticket")
    expect(publicJson).not.toContain("token=secret")
    expect(publicJson).not.toContain("Profile 1")
    expect(publicJson).not.toContain("window-private")
    expect(publicJson).not.toContain("tab-private")
    expect(publicJson).not.toContain("accessibility_api")
    expect(publicJson).not.toContain("internal-private-instance")
  })

  it("blocks before invoke when approval is missing", () => {
    const plan = buildYeonjangBrowserActiveTabInfoPreDispatchBridgePlan({
      readyTarget: READY_TARGET,
      criteria: buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria({}),
      rustInventory: buildYeonjangBrowserActiveTabInfoRustInventoryContract({}),
      redactedProjection: REDACTED_PROJECTION.ok ? REDACTED_PROJECTION.observation : undefined,
      now: APPROVAL_NOW,
    })

    expect(plan).toMatchObject({
      status: "blocked",
      reasonCode: "active_tab_info_approval_required",
      method: "browser.active_tab_info",
      invokeNow: false,
      addRustDispatchNow: false,
      addProductionBindingNow: false,
    })
  })

  it("blocks before invoke when readiness or backend contracts are missing", () => {
    expect(
      buildYeonjangBrowserActiveTabInfoPreDispatchBridgePlan({
        approvalReceipt: APPROVAL,
        criteria: buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria({}),
        rustInventory: buildYeonjangBrowserActiveTabInfoRustInventoryContract({}),
        redactedProjection: REDACTED_PROJECTION.ok ? REDACTED_PROJECTION.observation : undefined,
        now: APPROVAL_NOW,
      }),
    ).toMatchObject({
      status: "blocked",
      reasonCode: "active_tab_info_ready_target_required",
    })

    expect(
      buildYeonjangBrowserActiveTabInfoPreDispatchBridgePlan({
        readyTarget: READY_TARGET,
        approvalReceipt: APPROVAL,
        rustInventory: buildYeonjangBrowserActiveTabInfoRustInventoryContract({}),
        redactedProjection: REDACTED_PROJECTION.ok ? REDACTED_PROJECTION.observation : undefined,
        now: APPROVAL_NOW,
      }),
    ).toMatchObject({
      status: "blocked",
      reasonCode: "active_tab_info_backend_criteria_required",
    })

    expect(
      buildYeonjangBrowserActiveTabInfoPreDispatchBridgePlan({
        readyTarget: READY_TARGET,
        approvalReceipt: APPROVAL,
        criteria: buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria({}),
        redactedProjection: REDACTED_PROJECTION.ok ? REDACTED_PROJECTION.observation : undefined,
        now: APPROVAL_NOW,
      }),
    ).toMatchObject({
      status: "blocked",
      reasonCode: "active_tab_info_rust_inventory_contract_required",
    })
  })

  it("requires a redacted projection and never exposes raw active tab fields", () => {
    const missingProjection = buildYeonjangBrowserActiveTabInfoPreDispatchBridgePlan({
      readyTarget: READY_TARGET,
      approvalReceipt: APPROVAL,
      criteria: buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria({}),
      rustInventory: buildYeonjangBrowserActiveTabInfoRustInventoryContract({}),
      now: APPROVAL_NOW,
    })
    expect(missingProjection).toMatchObject({
      status: "blocked",
      reasonCode: "active_tab_info_redacted_projection_required",
    })

    const readyPlan = buildYeonjangBrowserActiveTabInfoPreDispatchBridgePlan({
      readyTarget: READY_TARGET,
      approvalReceipt: APPROVAL,
      criteria: buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria({}),
      rustInventory: buildYeonjangBrowserActiveTabInfoRustInventoryContract({}),
      redactedProjection: REDACTED_PROJECTION.ok ? REDACTED_PROJECTION.observation : undefined,
      now: APPROVAL_NOW,
    })

    expect(readyPlan).toMatchObject({
      status: "prepared",
      reasonCode: "active_tab_info_pre_dispatch_prepared",
      method: "browser.active_tab_info",
      toolName: "yeonjang_browser_active_tab_info",
      invokeNow: false,
      addRustDispatchNow: false,
      addProductionBindingNow: false,
      requiredGates: [
        "ready_target",
        "approval_receipt",
        "backend_criteria",
        "rust_inventory_contract",
        "redacted_projection",
      ],
    })

    const publicJson = JSON.stringify(readyPlan)
    expect(publicJson).not.toContain("Private Ticket")
    expect(publicJson).not.toContain("token=private")
    expect(publicJson).not.toContain("rawTitle")
    expect(publicJson).not.toContain("rawUrl")
    expect(publicJson).not.toContain("pid")
    expect(publicJson).not.toContain("windowId")
    expect(publicJson).not.toContain("tabId")
  })

  it("fails closed when a pre-dispatch projection carries public-forbidden raw fields", () => {
    const plan = buildYeonjangBrowserActiveTabInfoPreDispatchBridgePlan({
      readyTarget: READY_TARGET,
      approvalReceipt: APPROVAL,
      criteria: buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria({}),
      rustInventory: buildYeonjangBrowserActiveTabInfoRustInventoryContract({}),
      redactedProjection: {
        ...(REDACTED_PROJECTION.ok ? REDACTED_PROJECTION.observation : {
          schemaVersion: "yeonjang-browser-active-tab-info-v1" as const,
          method: "browser.active_tab_info" as const,
          observationStatus: "available" as const,
          browserName: "Google Chrome",
          publicEvidenceFields: [],
          auditOnlyFields: [],
        }),
        title: "Private Ticket",
        rawDetails: {
          url: "https://example.test/account?token=private",
        },
      } as unknown as typeof REDACTED_PROJECTION extends { ok: true; observation: infer T } ? T : never,
      now: APPROVAL_NOW,
    })

    expect(plan).toMatchObject({
      status: "blocked",
      reasonCode: "active_tab_info_redacted_projection_required",
      invokeNow: false,
      addRustDispatchNow: false,
      addProductionBindingNow: false,
    })
    expect(JSON.stringify(plan)).not.toContain("Private Ticket")
    expect(JSON.stringify(plan)).not.toContain("token=private")
  })
})
