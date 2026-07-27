import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import {
  buildEmptyResultRecoveryPrompt,
  buildTruncatedOutputRecoveryPrompt,
} from "../packages/core/src/runs/recovery.ts"

describe("task0931 empty and truncated recovery prompt sources", () => {
  it("registers empty and truncated recovery inputs as file-backed internal prompt sources", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const empty = registry.find((item) => item.sourceId === "empty_result_recovery_user" && item.locale === "en")
    const truncated = registry.find((item) => item.sourceId === "truncated_output_recovery_user" && item.locale === "en")

    expect(empty).toMatchObject({ sourceId: "empty_result_recovery_user", usageScope: "internal", enabled: true })
    expect(truncated).toMatchObject({ sourceId: "truncated_output_recovery_user", usageScope: "internal", enabled: true })
    expect(empty?.path.endsWith("prompts/empty_result_recovery_user.md")).toBe(true)
    expect(truncated?.path.endsWith("prompts/truncated_output_recovery_user.md")).toBe(true)
    expect(empty?.content).toContain("{{originalRequest}}")
    expect(empty?.content).toContain("{{previousResult}}")
    expect(empty?.content).toContain("{{successfulTools}}")
    expect(empty?.content).toContain("{{filesystemMutationNote}}")
    expect(truncated?.content).toContain("{{originalRequest}}")
    expect(truncated?.content).toContain("{{summary}}")
    expect(truncated?.content).toContain("{{reason}}")
    expect(truncated?.content).toContain("{{remainingItems}}")
    expect(truncated?.content).toContain("{{previousResult}}")
  })

  it("renders empty result recovery evidence from runtime values", () => {
    const prompt = buildEmptyResultRecoveryPrompt({
      originalRequest: "파일을 만들어줘",
      previousResult: "",
      successfulTools: [{ toolName: "file_write", output: "ok" }],
      sawRealFilesystemMutation: true,
    })

    expect(prompt).toContain("[Empty Result Recovery]")
    expect(prompt).toContain("Original user request:\n파일을 만들어줘")
    expect(prompt).toContain("Successful tool executions:\n1. file_write")
    expect(prompt).toContain("A real file or folder mutation was detected")
  })

  it("renders truncated output recovery evidence from runtime values", () => {
    const prompt = buildTruncatedOutputRecoveryPrompt({
      originalRequest: "코드를 끝까지 완성해줘",
      previousResult: "partial code",
      summary: "review says output was cut off",
      reason: "missing closing block",
      remainingItems: ["마무리 코드 작성"],
    })

    expect(prompt).toContain("[Truncated Output Recovery]")
    expect(prompt).toContain("Original user request:\n코드를 끝까지 완성해줘")
    expect(prompt).toContain("Review summary:\nreview says output was cut off")
    expect(prompt).toContain("Review reason:\nmissing closing block")
    expect(prompt).toContain("Remaining items:\n- 마무리 코드 작성")
    expect(prompt).toContain("Previous incomplete result:\npartial code")
  })

  it("does not keep empty or truncated recovery envelopes hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/recovery.ts", "utf-8")

    expect(source).toContain('sourceId: "empty_result_recovery_user"')
    expect(source).toContain('sourceId: "truncated_output_recovery_user"')
    expect(source).not.toContain("[Empty Result Recovery]")
    expect(source).not.toContain("[Truncated Output Recovery]")
    expect(source).not.toContain("이전 시도는 실행이 끝났지만 완료로 볼 수 있는 명확한 결과가 남지 않았습니다.")
    expect(source).not.toContain("이전 시도에서 코드 또는 결과가 중간에 끊기거나 미완성으로 끝났습니다.")
  })
})
