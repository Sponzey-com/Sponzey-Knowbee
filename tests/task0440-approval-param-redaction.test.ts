import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  buildApprovalParamSummary,
  describeApprovalToolName,
} from "../packages/webui/src/lib/approval-preview.ts"

const runApprovalSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "runs", "RunApprovalActions.tsx"),
  "utf-8",
)

const approvalModalSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "ApprovalModal.tsx"),
  "utf-8",
)

const ko = (koText: string) => koText

describe("task0440 approval parameter redaction", () => {
  it("summarizes approval params without leaking raw values", () => {
    const summary = buildApprovalParamSummary({
      command: "cat /Users/example/private.txt",
      apiKey: "sk-test-secret",
      url: "https://internal.example.test/path?token=abc",
      display: 1,
    }, ko).join(" ")

    expect(summary).toContain("입력 항목 4개")
    expect(summary).toContain("명령 실행 세부값은 숨김")
    expect(summary).toContain("외부 주소 세부값은 숨김")
    expect(summary).toContain("민감하거나 긴 값")
    expect(summary).not.toContain("/Users/example")
    expect(summary).not.toContain("sk-test-secret")
    expect(summary).not.toContain("internal.example")
  })

  it("maps raw tool ids to user-readable action names", () => {
    expect(describeApprovalToolName("shell_exec", ko)).toBe("터미널 명령 실행")
    expect(describeApprovalToolName("screen_capture", ko)).toBe("화면 캡처")
    expect(describeApprovalToolName("unknown_internal_tool", ko)).toBe("외부 도구 실행")
  })

  it("removes raw params and raw tool ids from approval surfaces", () => {
    expect(runApprovalSource).not.toContain("JSON.stringify(approval.params")
    expect(approvalModalSource).not.toContain("JSON.stringify(resolvedApproval.params")
    expect(runApprovalSource).toContain("buildApprovalParamSummary(approval.params, text)")
    expect(approvalModalSource).toContain("buildApprovalParamSummary(resolvedApproval.params, text)")

    expect(runApprovalSource).not.toContain("{approval.toolName}</div>")
    expect(approvalModalSource).not.toContain("{resolvedApproval.toolName}</code>")
    expect(runApprovalSource).toContain("describeApprovalToolName(approval.toolName, text)")
    expect(approvalModalSource).toContain("describeApprovalToolName(resolvedApproval.toolName, text)")
  })
})
