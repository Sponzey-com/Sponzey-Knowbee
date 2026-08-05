import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { AGENT_OPERATIONAL_SETTINGS_WRITE_OWNER } from "../packages/core/src/agents/agent-operational-settings-command.js"

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

describe("Task 043 operational settings write owner", () => {
  it("declares one application command owner", () => {
    expect(AGENT_OPERATIONAL_SETTINGS_WRITE_OWNER).toBe("agent_operational_settings_command_v1")
    const repository = source(
      "../packages/core/src/agents/agent-operational-settings-repository.ts",
    )
    expect(repository).toContain("compareAndUpdateAgentOperationalSettings")
    expect(repository).toContain("expectedRevision")
  })

  it("keeps the legacy advanced editor unmounted", () => {
    const app = source("../packages/webui/src/App.tsx")
    const setup = source("../packages/webui/src/pages/SetupPage.tsx")
    const topology = source("../packages/webui/src/pages/TopologyWorkspacePage.tsx")
    for (const mountedSource of [app, setup, topology])
      expect(mountedSource).not.toContain("SubAgentAdvancedSettingsPanel")
  })

  it("limits the setup topology compatibility writer to identity fields", () => {
    const topologySync = source("../packages/webui/src/lib/topology-sub-agent-sync.ts")
    const body = topologySync
      .split("export function applyTopologyExecutorToSetupDraft")[1]
      ?.split("export function archiveTopologySubAgentInSetupDraft")[0]
    expect(body).toBeTruthy()
    expect(body).toContain("agentName")
    expect(body).toContain("role")
    expect(body).toContain("description")
    expect(body).not.toMatch(/modelPolicy|memoryPolicy|capabilityPolicy|skillMcpBindings/u)
  })
})
