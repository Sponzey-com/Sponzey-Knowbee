import { describe, expect, it } from "vitest"
import {
  dryRunPromptSourceAssembly,
  inspectPromptSourceAssemblyCoverage,
} from "../packages/core/src/memory/knowbee-md.ts"

describe("task0775 prompt assembly coverage", () => {
  it("keeps every active English runtime prompt source fully present in the assembled prompt", () => {
    const assembly = dryRunPromptSourceAssembly(process.cwd(), "en").assembly

    expect(assembly).not.toBeNull()
    const coverage = inspectPromptSourceAssemblyCoverage(assembly!)

    expect(coverage.ok, JSON.stringify(coverage, null, 2)).toBe(true)
    expect(coverage.omittedSourceIds).toEqual([])
    expect(coverage.truncatedSourceIds).toEqual([])
    expect(assembly!.text).toContain("ScheduleContract")
    expect(assembly!.text).toContain(
      "Require a registered capability binding and explicit authorization before every Skill, MCP, or tool invocation.",
    )
    expect(assembly!.text).toContain("Low-risk prompt improvements may skip approval only when known regression tests pass and an exact rollback target exists before write.")
  })

  it("reports omitted and truncated prompt source fragments", () => {
    const assembly = dryRunPromptSourceAssembly(process.cwd(), "en").assembly!
    const firstSourceHeader = `[Prompt Source: ${assembly.sources[0].sourceId}:${assembly.sources[0].locale}@${assembly.sources[0].version}]`
    const brokenAssembly = {
      ...assembly,
      text: `${firstSourceHeader}\n# Partial`,
    }

    const coverage = inspectPromptSourceAssemblyCoverage(brokenAssembly)

    expect(coverage.ok).toBe(false)
    expect(coverage.truncatedSourceIds).toContain(assembly.sources[0].sourceId)
    expect(coverage.omittedSourceIds.length).toBeGreaterThan(0)
  })
})
