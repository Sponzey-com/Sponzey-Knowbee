import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import {
  buildFilesystemMutationFollowupPrompt,
  buildFilesystemVerificationRecoveryPrompt,
} from "../packages/core/src/runs/recovery.ts"

describe("task0930 filesystem recovery prompt sources", () => {
  it("registers filesystem recovery inputs as file-backed internal prompt sources", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const mutation = registry.find((item) => item.sourceId === "filesystem_execution_required_user" && item.locale === "en")
    const verification = registry.find((item) => item.sourceId === "filesystem_verification_recovery_user" && item.locale === "en")

    expect(mutation).toMatchObject({ sourceId: "filesystem_execution_required_user", usageScope: "internal", enabled: true })
    expect(verification).toMatchObject({ sourceId: "filesystem_verification_recovery_user", usageScope: "internal", enabled: true })
    expect(mutation?.path.endsWith("prompts/filesystem_execution_required_user.md")).toBe(true)
    expect(verification?.path.endsWith("prompts/filesystem_verification_recovery_user.md")).toBe(true)
    expect(mutation?.content).toContain("{{originalRequest}}")
    expect(mutation?.content).toContain("{{previousResult}}")
    expect(verification?.content).toContain("{{originalRequest}}")
    expect(verification?.content).toContain("{{verificationSummary}}")
    expect(verification?.content).toContain("{{verificationReason}}")
    expect(verification?.content).toContain("{{targetPaths}}")
    expect(verification?.content).toContain("{{missingItems}}")
    expect(verification?.content).toContain("{{previousResult}}")
  })

  it("renders filesystem mutation follow-up evidence from runtime values", () => {
    const prompt = buildFilesystemMutationFollowupPrompt({
      originalRequest: "파일을 생성해줘",
      previousResult: "아직 파일을 만들지 않았습니다.",
    })

    expect(prompt).toContain("[Filesystem Execution Required]")
    expect(prompt).toContain("Original user request:\n파일을 생성해줘")
    expect(prompt).toContain("Previous incomplete result:\n아직 파일을 만들지 않았습니다.")
  })

  it("renders filesystem verification recovery evidence from runtime values", () => {
    const prompt = buildFilesystemVerificationRecoveryPrompt({
      originalRequest: "파일을 생성해줘",
      previousResult: "partial",
      verificationSummary: "verification failed",
      verificationReason: "file missing",
      missingItems: ["경로 확인"],
      mutationPaths: ["/tmp/a.txt"],
    })

    expect(prompt).toContain("[Filesystem Verification Recovery]")
    expect(prompt).toContain("Original user request:\n파일을 생성해줘")
    expect(prompt).toContain("Verification summary:\nverification failed")
    expect(prompt).toContain("Verification reason:\nfile missing")
    expect(prompt).toContain("Current target paths:\n- /tmp/a.txt")
    expect(prompt).toContain("Missing or unchecked items:\n- 경로 확인")
    expect(prompt).toContain("Previous result:\npartial")
  })

  it("does not keep filesystem recovery envelopes hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/recovery.ts", "utf-8")

    expect(source).toContain('sourceId: "filesystem_execution_required_user"')
    expect(source).toContain('sourceId: "filesystem_verification_recovery_user"')
    expect(source).not.toContain("[Filesystem Execution Required]")
    expect(source).not.toContain("[Filesystem Verification Recovery]")
    expect(source).not.toContain("원래 사용자 요청은 실제 로컬 파일 또는 폴더 변경이 필요합니다.")
    expect(source).not.toContain("이전 시도에서 실제 파일 또는 폴더 결과를 자동 검증하지 못했습니다.")
  })
})
