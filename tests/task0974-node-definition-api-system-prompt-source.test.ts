import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

const repoRoot = process.cwd()

describe("task0974 node definition API system prompt source", () => {
  it("registers the node definition API system envelope as an internal prompt source", () => {
    const source = loadPromptSourceRegistry(repoRoot).find(
      (item) => item.sourceId === "node_definition_api_system_user" && item.locale === "en",
    )

    expect(source).toMatchObject({ sourceId: "node_definition_api_system_user", usageScope: "internal", enabled: true })
    expect(source?.content).toContain("You return JSON only.")
    expect(source?.content).toContain("\"alternatives\"")
    expect(source?.content).toContain("Use Korean user-facing text.")
  })

  it("removes the API system prompt body from topologies TypeScript", () => {
    const source = readFileSync(join(repoRoot, "packages/core/src/api/routes/topologies.ts"), "utf8")

    expect(source).toContain("node_definition_api_system_user")
    expect(source).not.toContain("\"You return JSON only.\"")
    expect(source).not.toContain("The JSON shape is {")
    expect(source).not.toContain("Return only the final reviewed JSON.")
  })
})
