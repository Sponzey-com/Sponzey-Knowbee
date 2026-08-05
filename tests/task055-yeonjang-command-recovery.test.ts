import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { UiRequestFailure } from "../packages/webui/src/api/request-failure.js"
import {
  capabilityCommandRecoveryText,
  projectCapabilityCommandFailure,
  projectCapabilityReceiptReason,
} from "../packages/webui/src/lib/capability-command-recovery.js"
import {
  initialYeonjangBindingFlow,
  reduceYeonjangBindingFlow,
} from "../packages/webui/src/lib/yeonjang-detail-flow.js"

describe("Task055 Yeonjang command recovery", () => {
  it("projects request and receipt failures to a bounded canonical kind", () => {
    expect(
      projectCapabilityCommandFailure(
        new UiRequestFailure({
          status: 503,
          reasonCode: "private_adapter_failure",
          safeMessage: "do not expose",
        }),
      ),
    ).toBe("capability_command_unavailable")
    expect(projectCapabilityReceiptReason("mutation_revision_conflict")).toBe(
      "capability_command_conflict",
    )
    expect(projectCapabilityReceiptReason("private_unknown_receipt")).toBe(
      "capability_command_failed",
    )
    expect(capabilityCommandRecoveryText("private_unknown_receipt", "ko")).not.toContain(
      "private_unknown_receipt",
    )
  })

  it("requires authoritative refresh after a partial binding application", () => {
    const editing = reduceYeonjangBindingFlow(initialYeonjangBindingFlow(["agent-a"]), {
      type: "edit",
      selectedAgentRefs: ["agent-a"],
    })
    const saving = reduceYeonjangBindingFlow(editing, { type: "save" })
    const failed = reduceYeonjangBindingFlow(saving, {
      type: "failed",
      reasonCode: "capability_command_unavailable",
      requiresRefresh: true,
    })
    expect(failed).toMatchObject({ state: "failed", requiresRefresh: true })
    expect(() => reduceYeonjangBindingFlow(failed, { type: "save" })).toThrow()
  })

  it("forbids raw reason transfer and rendering in the page owner", () => {
    const page = readFileSync(
      new URL("../packages/webui/src/pages/YeonjangCatalogPage.tsx", import.meta.url),
      "utf8",
    )
    expect(page).not.toContain("cause instanceof Error ? cause.message")
    expect(page).not.toContain("throw new Error(receipt.reasonCode")
    expect(page).not.toContain('{props.recoveryFlow.reasonCode ?? "yeonjang_recovery_failed"}')
    expect(page).not.toContain('{props.bindingFlow.reasonCode ?? "yeonjang_binding_failed"}')
    expect(page).toContain("projectCapabilityCommandFailure")
    expect(page).toContain("projectCapabilityReceiptReason")
  })
})
