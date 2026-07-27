import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadMergedInstructions } from "../packages/core/src/instructions/merge.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

const SOURCE_ID = "instruction_merge_context_labels_user"
const repoRoot = process.cwd()
const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0983 instruction merge labels", () => {
  it("registers instruction merge labels as an internal prompt source", () => {
    const source = loadPromptSourceRegistry(repoRoot)
      .find((item) => item.sourceId === SOURCE_ID && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: SOURCE_ID,
      required: false,
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.content).toContain("instruction_source_header=[Instruction Source {{index}}]")
    expect(source?.content).toContain("agent_instruction_source_header=[Agent Instruction Source {{index}}]")
  })

  it("renders merged instruction headers from source labels", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task0983-instructions-"))
    tempDirs.push(root)
    mkdirSync(join(root, ".git"), { recursive: true })
    writeFileSync(join(root, "AGENTS.md"), "Project instruction", "utf8")
    const stateDir = join(root, ".state")
    mkdirSync(stateDir, { recursive: true })

    const bundle = loadMergedInstructions(root, {
      globalStateDir: stateDir,
      fallbackBoundaryDir: root,
      agentSources: [{
        agentId: "agent:researcher",
        agentType: "sub_agent",
        sourceId: "prompt-bundle",
        content: "Agent specific prompt",
      }],
    })

    expect(bundle.mergedText).toContain("[Instruction Source 1]")
    expect(bundle.mergedText).toContain("[Agent Instruction Source 2]")
    expect(bundle.mergedText).toContain("Project instruction")
    expect(bundle.mergedText).toContain("Agent specific prompt")
  })

  it("removes instruction merge header literals from TypeScript", () => {
    const source = readFileSync(join(repoRoot, "packages/core/src/instructions/merge.ts"), "utf8")

    expect(source).toContain(SOURCE_ID)
    expect(source).not.toContain("`[Agent Instruction Source ${index + 1}]`")
    expect(source).not.toContain("`[Instruction Source ${index + 1}]`")
  })
})
