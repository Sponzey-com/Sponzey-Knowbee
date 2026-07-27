import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildExecutionRecoveryPrompt } from "../packages/core/src/runs/recovery.ts"

describe("task0928 generic execution recovery prompt source", () => {
  it("registers generic execution recovery input as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "execution_recovery_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "execution_recovery_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.path.endsWith("prompts/execution_recovery_user.md")).toBe(true)
    expect(source?.content).toContain("{{originalRequest}}")
    expect(source?.content).toContain("{{summary}}")
    expect(source?.content).toContain("{{reason}}")
    expect(source?.content).toContain("{{failedTools}}")
    expect(source?.content).toContain("{{alternatives}}")
    expect(source?.content).toContain("{{previousResult}}")
  })

  it("renders generic execution recovery evidence from runtime values", () => {
    const prompt = buildExecutionRecoveryPrompt({
      originalRequest: "예약을 등록해줘",
      previousResult: "create_schedule failed",
      summary: "create_schedule failed and needs another tool path.",
      reason: "invalid schedule registration path",
      toolNames: ["create_schedule", "create_schedule", "schedule_store"],
      alternatives: [{ kind: "other_schedule", label: "다른 일정 방식 검토" }],
    })

    expect(prompt).toContain("[Execution Recovery]")
    expect(prompt).toContain("Original user request:\n예약을 등록해줘")
    expect(prompt).toContain("Recovery summary:\ncreate_schedule failed and needs another tool path.")
    expect(prompt).toContain("Failure analysis:\ninvalid schedule registration path")
    expect(prompt).toContain("Failed tools: create_schedule, schedule_store")
    expect(prompt).toContain("Preferred alternatives:\n- 다른 일정 방식 검토")
    expect(prompt).toContain("Previous result:\ncreate_schedule failed")
  })

  it("does not keep the generic execution recovery envelope hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/recovery.ts", "utf-8")

    expect(source).toContain('sourceId: "execution_recovery_user"')
    expect(source).not.toContain("[Execution Recovery]")
    expect(source).not.toContain("이전 시도에서 실행 도구가 실패했습니다.")
    expect(source).not.toContain("도구 목록을 다시 확인하고, 같은 실패 경로를 그대로 반복하지 마세요.")
  })
})
