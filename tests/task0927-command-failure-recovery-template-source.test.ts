import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildCommandFailureRecoveryPrompt } from "../packages/core/src/runs/recovery.ts"

describe("task0927 command failure recovery prompt source", () => {
  it("registers command failure recovery input as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "command_failure_recovery_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "command_failure_recovery_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.path.endsWith("prompts/command_failure_recovery_user.md")).toBe(true)
    expect(source?.content).toContain("{{originalRequest}}")
    expect(source?.content).toContain("{{summary}}")
    expect(source?.content).toContain("{{reason}}")
    expect(source?.content).toContain("{{failedTools}}")
    expect(source?.content).toContain("{{alternatives}}")
    expect(source?.content).toContain("{{pathAliasHints}}")
    expect(source?.content).toContain("{{previousResult}}")
  })

  it("renders command recovery evidence from runtime values", () => {
    const prompt = buildCommandFailureRecoveryPrompt({
      originalRequest: "다운도르 밑에 지뢰라는 폴더를 만들어줘",
      previousResult: "ls failed",
      summary: "shell_exec failed and needs another path.",
      reason: "The target path does not exist.",
      failedTools: [{
        toolName: "shell_exec",
        output: "ls: /Users/demo/다운도르: No such file or directory",
        params: { command: "ls -la /Users/demo/다운도르" },
      }],
      alternatives: [{ kind: "other_tool", label: "다른 도구 경로 재시도" }],
    })

    expect(prompt).toContain("[Command Failure Recovery]")
    expect(prompt).toContain("Original user request:\n다운도르 밑에 지뢰라는 폴더를 만들어줘")
    expect(prompt).toContain("Recovery summary:\nshell_exec failed and needs another path.")
    expect(prompt).toContain("Failed command records:\n1. shell_exec failed:")
    expect(prompt).toContain("Preferred alternatives:\n- 다른 도구 경로 재시도")
    expect(prompt).toContain("Path alias candidates")
    expect(prompt).toContain("~/Downloads")
    expect(prompt).toContain("Previous result:\nls failed")
  })

  it("does not keep the command failure recovery envelope hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/recovery.ts", "utf-8")

    expect(source).toContain('sourceId: "command_failure_recovery_user"')
    expect(source).not.toContain("[Command Failure Recovery]")
    expect(source).not.toContain("이전 시도에서 로컬 명령 실행이 실패했습니다.")
    expect(source).not.toContain("실패 원인을 먼저 확인하고, 같은 실패 명령을 그대로 반복하지 마세요.")
  })
})
