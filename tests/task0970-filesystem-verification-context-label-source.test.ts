import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildFilesystemVerificationPrompt } from "../packages/core/src/runs/filesystem-verification.ts"

const repoRoot = process.cwd()

describe("task0970 filesystem verification context labels source", () => {
  it("registers filesystem verification context labels as an internal prompt source", () => {
    const source = loadPromptSourceRegistry(repoRoot).find(
      (item) => item.sourceId === "filesystem_verification_context_labels_user" && item.locale === "en",
    )

    expect(source).toMatchObject({
      sourceId: "filesystem_verification_context_labels_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.content).toContain("mutation_paths_header=[mutation_paths]")
  })

  it("renders mutation path labels from the file-backed source", () => {
    const prompt = buildFilesystemVerificationPrompt("create the report file", ["/tmp/report.md"])

    expect(prompt).toContain("[mutation_paths]")
    expect(prompt).toContain("- /tmp/report.md")
  })

  it("removes the mutation path prompt label from TypeScript", () => {
    const source = readFileSync(join(repoRoot, "packages/core/src/runs/filesystem-verification.ts"), "utf8")

    expect(source).not.toContain("\"[mutation_paths]\"")
    expect(source).not.toContain("'[mutation_paths]'")
    expect(source).not.toContain("`[mutation_paths]`")
  })
})
