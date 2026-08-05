import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildFilesystemVerificationPrompt } from "../packages/core/src/runs/filesystem-verification.ts"

describe("task0935 filesystem verification prompt source", () => {
  it("registers filesystem verification input as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "filesystem_verification_user" && item.locale === "en")

    expect(source).toMatchObject({ sourceId: "filesystem_verification_user", usageScope: "internal", enabled: true })
    expect(source?.path.endsWith("prompts/filesystem_verification_user.md")).toBe(true)
    expect(source?.content).toContain("{{originalRequest}}")
    expect(source?.content).toContain("{{mutationPathsBlock}}")
  })

  it("renders verification evidence from runtime values", () => {
    const prompt = buildFilesystemVerificationPrompt(
      "Downloads에 \"달력\" 폴더를 만들어줘",
      ["/tmp/work/Downloads/달력", "/tmp/work/Downloads/달력/index.html"],
    )

    expect(prompt).toContain("# Filesystem Verification")
    expect(prompt).toContain("[Filesystem Verification]")
    expect(prompt).toContain("Original user request:\nDownloads에 \"달력\" 폴더를 만들어줘")
    expect(prompt).toContain("[mutation_paths]")
    expect(prompt).toContain("- /tmp/work/Downloads/달력/index.html")
    expect(prompt).toContain("Do not claim a file or folder exists without direct filesystem evidence.")
  })

  it("does not keep the filesystem verification prompt envelope hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/filesystem-verification.ts", "utf-8")

    expect(source).toContain('sourceId: "filesystem_verification_user"')
    expect(source).not.toContain("원래 사용자 요청")
    expect(source).not.toContain("검증 대상 경로:")
  })
})
