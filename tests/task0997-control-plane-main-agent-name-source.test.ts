import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0997 control-plane main-agent name source", () => {
  it("uses the central identity resolver instead of local default-name rules", () => {
    const source = readFileSync("packages/core/src/control-plane/index.ts", "utf-8")

    expect(source).toContain('resolveMainAgentSelfName')
    expect(source).toContain('DEFAULT_MAIN_AGENT_NAME_EN')
    expect(source).not.toMatch(/const\s+DEFAULT_MAIN_AGENT_NAME\s*=\s*"Knowbee"/u)
    expect(source).not.toMatch(/const\s+DEFAULT_MAIN_AGENT_NAME_KO\s*=\s*"노비"/u)
    expect(source).not.toMatch(/function\s+defaultMainAgentNameForLanguage/u)
    expect(source).toMatch(/function\s+resolveMainAgentName[\s\S]*return resolveMainAgentSelfName\(config\)/u)
  })
})
