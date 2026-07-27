import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import type { MemoryInspectorSnapshot } from "../packages/webui/src/api/client.ts"
import { MemorySettingsOverviewPanel } from "../packages/webui/src/components/setup/MemorySettingsOverviewPanel.tsx"
import { UNIFIED_SETTINGS_SECTIONS } from "../packages/webui/src/lib/unified-settings-ownership.ts"
import { buildSingleSettingsWorkspace } from "../packages/webui/src/lib/unified-settings-workspace.ts"

function memorySnapshot(): MemoryInspectorSnapshot {
  return {
    generatedAt: 1,
    sessionId: "session-internal",
    summary: {
      owners: 1,
      warningOwners: 0,
      recallEvents: 2,
      compactionRuns: 3,
      qualityStatus: "healthy",
    },
    configuredPolicy: {
      minContextTokens: 100,
      keepLastMessages: 10,
      preservePinnedItems: true,
      rollupCapsuleCount: 4,
    },
    ownerCards: [
      {
        ownerScopeKey: "owner-secret-key",
        ownerType: "main_agent",
        agentNameSnapshot: "마당쇠",
        currentRawTokenEstimate: 123,
        pendingPreservationCount: 0,
        recallHitCount: 2,
        latestCapsuleAgeMs: 1000,
        activeCapsuleChainDepth: 1,
        latestRollupAgeMs: null,
        lastCompactionReason: "secret reason",
        driftWarningState: "healthy",
      },
    ],
    recentRecallEvents: [],
    recentCompactionRuns: [],
    controls: [],
  } as MemoryInspectorSnapshot
}

describe("task045 memory section overview", () => {
  it("defines global memory as a read-only runtime projection", () => {
    const section = UNIFIED_SETTINGS_SECTIONS.find((item) => item.id === "memory")
    expect(section?.commandOwner).toBe("memory.runtime.read")
    expect(section?.stateKinds).toEqual(["active"])

    const view = buildSingleSettingsWorkspace({
      locale: "ko",
      adminEnabled: false,
      selectedSectionId: "memory",
      lifecycleBySection: { memory: "active" },
    }).sections.find((item) => item.id === "memory")
    expect(view?.canSave).toBe(false)
    expect(view?.saveCommand).toBeNull()
  })

  it("renders bounded owner status without internal keys or raw records", () => {
    const snapshot = memorySnapshot()
    const html = renderToStaticMarkup(
      createElement(MemorySettingsOverviewPanel, {
        readState: {
          status: "ready",
          data: snapshot,
          observedAt: snapshot.generatedAt,
          failure: null,
        },
        onRefresh: () => undefined,
      }),
    )
    expect(html).toContain("마당쇠")
    expect(html).toContain("압축 실행")
    expect(html).not.toContain("owner-secret-key")
    expect(html).not.toContain("secret reason")
    expect(html).not.toContain("지금 압축")
  })

  it("keeps API orchestration in SetupPage and loads only for the selected section", () => {
    const source = readFileSync("packages/webui/src/pages/SetupPage.tsx", "utf8")
    expect(source).toContain('selectedSettingsSectionId !== "memory"')
    expect(source).toContain("api.memoryInspector")
    expect(source).toContain("<MemorySettingsOverviewPanel")
  })
})
