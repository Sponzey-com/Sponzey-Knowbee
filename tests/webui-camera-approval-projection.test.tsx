import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  approvalRemainingSeconds,
  buildApprovalScopeSummary,
} from "../packages/webui/src/lib/approval-preview.ts"

const text = (ko: string) => ko
const runApprovalSource = readFileSync(
  new URL("../packages/webui/src/components/runs/RunApprovalActions.tsx", import.meta.url),
  "utf8",
)
const modalSource = readFileSync(
  new URL("../packages/webui/src/components/ApprovalModal.tsx", import.meta.url),
  "utf8",
)
const chatStoreSource = readFileSync(
  new URL("../packages/webui/src/stores/chat.ts", import.meta.url),
  "utf8",
)

describe("WebUI camera approval projection", () => {
  it("distinguishes capture and external delivery without exposing the exact target", () => {
    const capture = buildApprovalScopeSummary({
      toolName: "yeonjang_camera_capture",
      params: { extensionId: "private-extension-target" },
      expiresAt: 61_000,
      now: 1_000,
    }, text).join(" ")
    const delivery = buildApprovalScopeSummary({
      toolName: "telegram_send_file",
      params: { filePath: "/Users/private/camera.jpg" },
      expiresAt: 61_000,
      now: 1_000,
    }, text).join(" ")

    expect(capture).toContain("카메라 촬영")
    expect(capture).toContain("정확한 외부 대상")
    expect(capture).toContain("60초")
    expect(capture).not.toContain("private-extension-target")
    expect(delivery).toContain("Telegram 외부 파일 전달")
    expect(delivery).not.toContain("/Users/private")
  })

  it("calculates bounded expiry from the authoritative server timestamp", () => {
    expect(approvalRemainingSeconds(61_001, 1_000)).toBe(61)
    expect(approvalRemainingSeconds(1_000, 1_000)).toBe(0)
    expect(approvalRemainingSeconds(null, 1_000)).toBeNull()
  })

  it("retains expiry and renders responsive accessible approval actions with recovery", () => {
    expect(chatStoreSource).toContain("expiresAt?: number | null")
    expect(chatStoreSource).toContain("typeof data.expiresAt === \"number\" || data.expiresAt === null")
    for (const source of [runApprovalSource, modalSource]) {
      expect(source).toContain("buildApprovalScopeSummary")
      expect(source).toContain("UserRecoveryNotice")
      expect(source).toContain("aria-label=")
      expect(source).toMatch(/overflow-y-auto|max-h-\[/u)
    }
    expect(modalSource).toContain("role=\"dialog\"")
    expect(modalSource).toContain("aria-modal=\"true\"")
  })
})
