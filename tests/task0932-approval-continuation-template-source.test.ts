import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { detectSyntheticApprovalRequest } from "../packages/core/src/runs/approval.ts"

describe("task0932 approval granted continuation prompt source", () => {
  it("registers approval continuation input as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "approval_granted_continuation_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "approval_granted_continuation_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.path.endsWith("prompts/approval_granted_continuation_user.md")).toBe(true)
    expect(source?.content).toContain("{{originalRequest}}")
    expect(source?.content).toContain("{{approvalPreview}}")
    expect(source?.content).toContain("{{toolName}}")
  })

  it("renders approval continuation evidence through the synthetic approval path", () => {
    const approval = detectSyntheticApprovalRequest({
      executionProfile: {
        approvalRequired: true,
        approvalTool: "screen_capture",
      },
      originalRequest: "메인 화면을 캡처해서 보여줘",
      preview: "스크린샷 캡처 권한이 필요합니다.",
      review: {
        status: "ask_user",
        summary: "화면 캡처 진행 전 승인이 필요합니다.",
        userMessage: "화면 기록 권한을 허용해 주세요.",
      },
      usesWorkerRuntime: true,
      requiresPrivilegedToolExecution: false,
      successfulTools: [],
      successfulFileDeliveries: [],
      sawRealFilesystemMutation: false,
    })

    expect(approval?.continuationPrompt).toContain("[Approval Granted Continuation]")
    expect(approval?.continuationPrompt).toContain("Original user request:\n메인 화면을 캡처해서 보여줘")
    expect(approval?.continuationPrompt).toContain("Previous approval request response:\n스크린샷 캡처 권한이 필요합니다.")
    expect(approval?.continuationPrompt).toContain("Approved action:\nscreen_capture")
  })

  it("does not keep the approval continuation envelope hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/approval.ts", "utf-8")

    expect(source).toContain('sourceId: "approval_granted_continuation_user"')
    expect(source).not.toContain("[Approval Granted Continuation]")
    expect(source).not.toContain("사용자가 앞서 요청된 로컬 작업을 승인했습니다.")
    expect(source).not.toContain("이제 실제 작업을 계속 진행하세요.")
  })
})
