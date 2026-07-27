import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

function readProjectFile(path: string): string {
  return readFileSync(join(root, path), "utf-8")
}

describe("task0908 memory owner scope terminology boundary", () => {
  it("documents long-term write gates separately from compaction owner scopes", () => {
    const policy = readProjectFile("prompts/memory_policy.md")

    expect(policy).toContain(
      "Long-term write gates use `OwnerScope.ownerType` values `knowbee` and `sub_agent`.",
    )
    expect(policy).toContain(
      "Compaction capsules and active memory state use `MemoryCapsuleOwnerScope.ownerType` values `main_agent` and `sub_agent`.",
    )
    expect(policy).toContain(
      "Do not authorize long-term memory writes from `MemoryCapsuleOwnerScope.ownerType`",
    )
  })

  it("matches the source contracts used by memory code", () => {
    const contracts = readProjectFile("packages/core/src/contracts/sub-agent-orchestration.ts")
    const capsule = readProjectFile("packages/core/src/memory/capsule.ts")
    const gate = readProjectFile("packages/core/src/memory/long-term-write-gate.ts")

    expect(contracts).toMatch(
      /ownerType:\s*"knowbee"\s*\|\s*"sub_agent"\s*\|\s*"team"\s*\|\s*"system"/u,
    )
    expect(contracts).toMatch(/ownerType:\s*"main_agent"\s*\|\s*"sub_agent"/u)
    expect(capsule).toContain(
      'export type MemoryCapsuleOwnerType = "main_agent" | "sub_agent" | "session" | "task"',
    )
    expect(gate).toContain('owner.ownerType === "knowbee" || owner.ownerType === "sub_agent"')
  })
})
