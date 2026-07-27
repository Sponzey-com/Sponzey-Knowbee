import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { canonicalizeLegacyAgentIdentity } from "../packages/core/src/adapters/legacy-agent-identity.ts"

const read = (path: string): string => readFileSync(path, "utf8")

function interfaceBody(source: string, name: string): string {
  const match = source.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`, "u"))
  if (!match?.[1]) throw new Error(`${name} interface was not found`)
  return match[1]
}

describe("task1179 canonical agent identity contract", () => {
  it("exposes only agentId and agentName as agent identity fields in setup drafts", () => {
    for (const path of [
      "packages/core/src/control-plane/index.ts",
      "packages/webui/src/contracts/setup.ts",
    ]) {
      const body = interfaceBody(read(path), "SetupSubAgentDraftItem")
      expect(body).toContain("agentId: string")
      expect(body).toContain("agentName?: string")
      expect(body).not.toMatch(/\bdisplayName\??:/u)
      expect(body).not.toMatch(/\bnickname\??:/u)
    }
  })

  it("does not export deprecated nickname identities from canonical contracts", () => {
    const contract = read("packages/core/src/contracts/sub-agent-orchestration.ts")
    const publicIndex = read("packages/core/src/index.ts")
    const settings = read("packages/core/src/ui/sub-agent-settings.ts")

    expect(contract).not.toMatch(/export (?:type|interface|function) Nickname/u)
    expect(contract).not.toContain("normalizeNickname")
    expect(contract).not.toContain("findNicknameNamespaceConflict")
    expect(publicIndex).not.toMatch(/\bNickname(?:EntityType|NamespaceConflict|NamespaceEntry|Snapshot)\b/u)
    expect(publicIndex).not.toMatch(/\b(?:normalizeNickname|normalizeNicknameSnapshot|findNicknameNamespaceConflict)\b/u)
    expect(settings).not.toContain("displayNameForAgent")
  })

  it("canonicalizes legacy imported identity once and drops legacy fields", () => {
    expect(canonicalizeLegacyAgentIdentity({
      agentId: "agent:legacy",
      displayName: "  Legacy   Researcher  ",
      nickname: "Ignored fallback",
      role: "research",
    })).toEqual({
      agentId: "agent:legacy",
      agentName: "Legacy Researcher",
      role: "research",
    })

    expect(canonicalizeLegacyAgentIdentity({
      agentId: "agent:nickname-only",
      nickname: "  Field   Analyst ",
    })).toEqual({
      agentId: "agent:nickname-only",
      agentName: "Field Analyst",
    })
  })
})
