import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  dryRunPromptSourceAssembly,
  inspectPromptSourceAssemblyCoverage,
  loadPromptSourceRegistry,
} from "../packages/core/src/memory/knowbee-md.ts"

const SOURCE_ID = "prompt_source_assembly_context_labels_user"
const repoRoot = process.cwd()

describe("task0982 prompt source assembly labels", () => {
  it("registers prompt source assembly labels as an internal prompt source", () => {
    const source = loadPromptSourceRegistry(repoRoot)
      .find((item) => item.sourceId === SOURCE_ID && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: SOURCE_ID,
      required: false,
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.content).toContain("fragment_header=[Prompt Source: {{sourceId}}:{{locale}}@{{version}}]")
    expect(source?.content).toContain("assembly_notice_header=[Prompt Source Assembly Notice]")
    expect(source?.content).toContain("truncation_notice=Earlier prompt source text was truncated to preserve final-stage runtime policies.")
  })

  it("renders prompt source assembly headers from source labels and preserves coverage", () => {
    const assembly = dryRunPromptSourceAssembly(repoRoot, "en").assembly

    expect(assembly).not.toBeNull()
    expect(assembly?.text).toContain("[Prompt Source: system:en@")
    expect(assembly?.text).toContain("[Prompt Source: final_response:en@")
    expect(inspectPromptSourceAssemblyCoverage(assembly!).ok).toBe(true)
  })

  it("removes assembly header and notice text literals from TypeScript", () => {
    const source = readFileSync(join(repoRoot, "packages/core/src/memory/knowbee-md.ts"), "utf8")

    expect(source).toContain(SOURCE_ID)
    expect(source).not.toContain("`[Prompt Source: ${source.sourceId}:${source.locale}@${source.version}]")
    expect(source).not.toContain("\"[Prompt Source Assembly Notice]\"")
    expect(source).not.toContain("\"Earlier prompt source text was truncated to preserve final-stage runtime policies.\"")
  })
})
