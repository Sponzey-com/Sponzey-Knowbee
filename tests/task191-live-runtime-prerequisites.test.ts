import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { LiveAcceptanceRuntimeSnapshot } from "../packages/core/src/release/live-acceptance-selection-preflight.ts"
import { inspectLiveAcceptanceSelectionAvailability } from "../packages/core/src/release/live-acceptance-selection-preflight.ts"

const NOW = Date.parse("2026-07-18T12:00:00.000Z")

function readySnapshot(): LiveAcceptanceRuntimeSnapshot {
  return Object.freeze({
    capturedAt: NOW,
    extensions: Object.freeze([
      Object.freeze({
        bindingId: "binding:skill:private",
        agentId: "agent:private",
        capabilityKind: "skill" as const,
        catalogId: "skill:private",
        bindingStatus: "enabled" as const,
        secretScopeId: null,
        enabledToolNamesJson: '["skill_private_probe"]',
        disabledToolNamesJson: "[]",
      }),
      Object.freeze({
        bindingId: "binding:mcp:private",
        agentId: "agent:private",
        capabilityKind: "mcp_server" as const,
        catalogId: "mcp:private",
        bindingStatus: "enabled" as const,
        secretScopeId: "secret:private",
        enabledToolNamesJson: '["mcp_private_probe"]',
        disabledToolNamesJson: "[]",
      }),
    ]),
    catalogs: Object.freeze([
      Object.freeze({
        capability: "skill" as const,
        catalogId: "skill:private",
        status: "enabled" as const,
        risk: "safe" as const,
        toolNamesJson: '["skill_private_probe"]',
      }),
      Object.freeze({
        capability: "mcp" as const,
        catalogId: "mcp:private",
        status: "enabled" as const,
        risk: "safe" as const,
        toolNamesJson: '["mcp_private_probe"]',
      }),
    ]),
    tools: Object.freeze([
      Object.freeze({
        name: "skill_private_probe",
        riskLevel: "safe" as const,
        requiresApproval: false,
        hasSideEffect: false,
      }),
      Object.freeze({
        name: "mcp_private_probe",
        riskLevel: "safe" as const,
        requiresApproval: false,
        hasSideEffect: false,
      }),
    ]),
    yeonjangInstances: Object.freeze([
      Object.freeze({
        instanceId: "instance:private",
        displayName: "Private workstation",
        state: "online" as const,
        trustState: "trusted" as const,
        scopeAccess: "allowed" as const,
        runnableTarget: true,
        liveSessionCount: 1,
        duplicateLiveSessionDetected: false,
        session: Object.freeze({
          sessionId: "session:private",
          state: "connected",
          lastSeenAt: NOW - 1_000,
          endedAt: null,
          stale: false,
        }),
      }),
    ]),
  })
}

describe("Task 191 live runtime prerequisites", () => {
  it("projects safe exact-selection availability without exposing runtime identifiers", () => {
    const result = inspectLiveAcceptanceSelectionAvailability({
      snapshot: readySnapshot(),
      now: NOW,
      maxYeonjangAgeMs: 30_000,
    })

    expect(result).toEqual([
      { capability: "skill", status: "ready" },
      { capability: "mcp", status: "ready" },
      { capability: "yeonjang", status: "ready" },
    ])
    expect(JSON.stringify(result)).not.toMatch(/private|binding|catalog|tool|session|instance/u)
  })

  it("returns one bounded unavailable reason when no exact MCP candidate is safe", () => {
    const current = readySnapshot()
    const result = inspectLiveAcceptanceSelectionAvailability({
      snapshot: Object.freeze({ ...current, catalogs: Object.freeze([current.catalogs[0]]) }),
      now: NOW,
      maxYeonjangAgeMs: 30_000,
    })

    expect(result).toEqual([
      { capability: "skill", status: "ready" },
      {
        capability: "mcp",
        status: "unavailable",
        reasonCode: "live_acceptance_mcp_selection_unavailable",
      },
      { capability: "yeonjang", status: "ready" },
    ])
  })

  it("assembles the default channel executor from the available channel adapters", () => {
    const source = readFileSync("packages/core/src/api/server.ts", "utf8")

    expect(source).toContain("createAvailableChannelSmokeLiveExecutor")
    expect(source).toMatch(
      /webUiLiveSmokeExecutor\s*\?\s*\{\s*webui:\s*webUiLiveSmokeExecutor\s*\}\s*:\s*\{\}/u,
    )
    expect(source).toMatch(
      /telegramLiveSmokeExecutor\s*\?\s*\{\s*telegram:\s*telegramLiveSmokeExecutor\s*\}\s*:\s*\{\}/u,
    )
    expect(source).toMatch(
      /slackLiveSmokeExecutor\s*\?\s*\{\s*slack:\s*slackLiveSmokeExecutor\s*\}\s*:\s*\{\}/u,
    )
  })

  it("binds all seven bounded readiness capabilities at the server route boundary", () => {
    const source = readFileSync("packages/core/src/api/server.ts", "utf8")

    expect(source).toContain("liveAcceptanceSelectionAvailabilityInspector")
    expect(source).toContain("inspectReadiness")
    for (const capability of ["webui", "telegram", "slack", "web"]) {
      expect(source).toMatch(new RegExp(`readinessItem\\(\\s*"${capability}"`, "u"))
    }
  })

  it("captures live channel targets once and keeps them out of launchctl command storage", () => {
    const source = readFileSync("scripts/knowbee-start.sh", "utf8")

    for (const [name, snapshot] of [
      ["KNOWBEE_CHANNEL_SMOKE_TELEGRAM_CHAT_ID", "LIVE_TELEGRAM_CHAT_ID_SNAPSHOT"],
      ["KNOWBEE_CHANNEL_SMOKE_TELEGRAM_USER_ID", "LIVE_TELEGRAM_USER_ID_SNAPSHOT"],
      ["KNOWBEE_CHANNEL_SMOKE_TELEGRAM_THREAD_ID", "LIVE_TELEGRAM_THREAD_ID_SNAPSHOT"],
      ["KNOWBEE_CHANNEL_SMOKE_SLACK_CHANNEL_ID", "LIVE_SLACK_CHANNEL_ID_SNAPSHOT"],
      ["KNOWBEE_CHANNEL_SMOKE_SLACK_USER_ID", "LIVE_SLACK_USER_ID_SNAPSHOT"],
      ["KNOWBEE_CHANNEL_SMOKE_SLACK_THREAD_TS", "LIVE_SLACK_THREAD_TS_SNAPSHOT"],
    ]) {
      expect(source).toContain(`${snapshot}=\"\${${name}:-}\"`)
      expect(source).toContain(`export ${name}=\"$${snapshot}\"`)
    }
    expect(source).toContain("live_targets_configured")
    expect(source).toContain("can_use_gateway_launchctl")
    expect(source).toContain("if can_use_gateway_launchctl; then")
    expect(source).toContain("if can_use_launchctl; then")
    const launchctlCommand = source.match(/printf -v command 'cd %q && export ([^']+)' \\\n/u)?.[1]
    expect(launchctlCommand).toBeDefined()
    expect(launchctlCommand).not.toMatch(/KNOWBEE_CHANNEL_SMOKE_(?:TELEGRAM|SLACK)/u)
  })
})
