import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  CONTRACT_SCHEMA_VERSION,
  validateTeamConfig,
  type TeamConfig,
} from "../packages/core/src/index.ts"

const now = Date.UTC(2026, 6, 6, 0, 0, 0)

function teamConfig(): TeamConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    teamId: "team:research",
    displayName: "Research Team",
    nickname: "Research",
    status: "enabled",
    purpose: "Research coordination",
    memberAgentIds: ["agent:alpha"],
    roleHints: ["research"],
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
  }
}

describe("task0468 team contract wording", () => {
  it("uses work ability and external feature connection wording for forbidden team ownership", () => {
    const invalid = validateTeamConfig({
      ...teamConfig(),
      allowedTools: ["shell_exec"],
      allowedMcpServers: ["browser"],
      skillMcpAllowlist: {},
    })

    expect(invalid.ok).toBe(false)
    if (!invalid.ok) {
      expect(invalid.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining(["$.allowedTools", "$.allowedMcpServers", "$.skillMcpAllowlist"]),
      )
      const messages = invalid.issues.map((issue) => issue.message)
      expect(messages).toEqual(
        expect.arrayContaining([
          "Teams cannot directly own tools, work abilities, external feature connections, or permission profiles.",
        ]),
      )
      expect(messages.join("\n")).not.toContain("tools, skills, MCP servers")
    }
  })

  it("does not keep old team ownership wording in contract sources", () => {
    const sourceFiles = [
      "packages/core/src/contracts/sub-agent-orchestration.ts",
      "packages/core/src/contracts/sub-agent-orchestration.js",
    ]
    const combined = sourceFiles
      .map((filePath) => readFileSync(join(process.cwd(), filePath), "utf8"))
      .join("\n")

    expect(combined).not.toContain("Teams cannot directly own tools, skills, MCP servers")
    expect(combined).toContain(
      "Teams cannot directly own tools, work abilities, external feature connections, or permission profiles.",
    )
  })
})
