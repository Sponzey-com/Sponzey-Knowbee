import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import {
  buildAiErrorRecoveryPrompt,
  buildCommandFailureRecoveryPrompt,
  buildDirectArtifactDeliveryRecoveryPrompt,
  buildEmptyResultRecoveryPrompt,
  buildExecutionRecoveryPrompt,
  buildFilesystemVerificationRecoveryPrompt,
  buildTruncatedOutputRecoveryPrompt,
} from "../packages/core/src/runs/recovery.ts"

describe("task0965 recovery prompt section text source", () => {
  it("registers recovery section text as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "recovery_prompt_section_text_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "recovery_prompt_section_text_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.path.endsWith("prompts/recovery_prompt_section_text_user.md")).toBe(true)
    expect(source?.content).toContain("## Value")
    expect(source?.content).toContain("previous_result=Previous result:")
    expect(source?.content).toContain("preferred_alternatives=Preferred alternatives:")
    expect(source?.content).toContain("download_location_candidate=Download location candidate: {{downloadPath}}")
    expect(source?.content).toContain("filesystem_mutation_note=A real file or folder mutation was detected")
    expect(source?.content).toContain("## Out Of Scope")
  })

  it("renders existing recovery section labels from the prompt source", () => {
    const direct = buildDirectArtifactDeliveryRecoveryPrompt({
      originalRequest: "파일을 보내줘",
      previousResult: "stored locally",
      successfulTools: [{ toolName: "file_write", output: "ok" }],
      successfulFileDeliveries: [{ channel: "telegram", filePath: "/tmp/a.txt" }],
      alternatives: [{ kind: "same_channel_retry", label: "같은 채널 재전송 시도" }],
    })
    const command = buildCommandFailureRecoveryPrompt({
      originalRequest: "다운도르 밑에 폴더를 만들어줘",
      previousResult: "ls failed",
      summary: "shell failed",
      reason: "missing path",
      failedTools: [{
        toolName: "shell_exec",
        output: "ls: /Users/demo/다운도르: No such file or directory",
        params: { command: "ls -la /Users/demo/다운도르" },
      }],
      alternatives: [{ kind: "other_tool", label: "다른 도구 경로 재시도" }],
    })
    const execution = buildExecutionRecoveryPrompt({
      originalRequest: "예약해줘",
      previousResult: "partial",
      summary: "tool failed",
      reason: "bad route",
      toolNames: ["create_schedule", "schedule_store"],
      alternatives: [{ kind: "other_schedule", label: "다른 일정 방식 검토" }],
    })
    const ai = buildAiErrorRecoveryPrompt({
      originalRequest: "요약해줘",
      previousResult: "partial",
      summary: "AI failed",
      reason: "rate limit",
      message: "429 too many requests",
      failedRoute: "OpenAI / gpt-4o-mini",
      avoidTargets: ["rate-limit-window"],
      nextRouteHint: "Retry after route review.",
    })
    const filesystem = buildFilesystemVerificationRecoveryPrompt({
      originalRequest: "파일 만들어줘",
      previousResult: "partial",
      verificationSummary: "verification failed",
      verificationReason: "file missing",
      missingItems: ["경로 확인"],
      mutationPaths: ["/tmp/a.txt"],
    })
    const empty = buildEmptyResultRecoveryPrompt({
      originalRequest: "파일 만들어줘",
      previousResult: "partial",
      successfulTools: [{ toolName: "file_write", output: "ok" }],
      sawRealFilesystemMutation: true,
    })
    const truncated = buildTruncatedOutputRecoveryPrompt({
      originalRequest: "코드를 끝까지 완성해줘",
      previousResult: "partial code",
      summary: "cut off",
      reason: "missing closing block",
      remainingItems: ["마무리 코드 작성"],
    })

    expect(direct).toContain("Successful tool executions:\n1. file_write")
    expect(direct).toContain("Already delivered files:\n1. telegram: /tmp/a.txt")
    expect(command).toContain("Failed command records:\n1. shell_exec failed:")
    expect(command).toContain("Path alias candidates:\n- Download location candidate:")
    expect(execution).toContain("Failed tools: create_schedule, schedule_store")
    expect(ai).toContain("Avoid these targets:\n- rate-limit-window")
    expect(filesystem).toContain("Missing or unchecked items:\n- 경로 확인")
    expect(empty).toContain("Current text result:\npartial")
    expect(empty).toContain("A real file or folder mutation was detected")
    expect(truncated).toContain("Remaining items:\n- 마무리 코드 작성")
  })

  it("does not keep recovery section labels hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/recovery.ts", "utf-8")
    const removedFragments = [
      "Previous result:\\n",
      "Previous incomplete result:\\n",
      "Current text result:\\n",
      "Successful tool executions:",
      "Already delivered files:",
      "Preferred alternatives:",
      "Failed command records:",
      "Path alias candidates:",
      "Download location candidate:",
      "Failed tools:",
      "Error detail:",
      "Failed approach:",
      "Avoid these targets:",
      "Preferred recovery route:",
      "Verification reason:",
      "Current target paths:",
      "Missing or unchecked items:",
      "A real file or folder mutation was detected",
      "Review summary:",
      "Review reason:",
      "Remaining items:",
    ]

    expect(source).toContain('RECOVERY_PROMPT_SECTION_TEXT_SOURCE_ID = "recovery_prompt_section_text_user"')
    for (const fragment of removedFragments) {
      expect(source).not.toContain(fragment)
    }
  })
})
