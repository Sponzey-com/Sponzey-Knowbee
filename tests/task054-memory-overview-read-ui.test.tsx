import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import type { MemoryInspectorSnapshot } from "../packages/webui/src/api/client.js"
import { MemorySettingsOverviewPanel } from "../packages/webui/src/components/setup/MemorySettingsOverviewPanel.js"
import type { ResourceReadState } from "../packages/webui/src/lib/resource-read-state.js"

function snapshot(ownerCount = 1): MemoryInspectorSnapshot {
  return {
    generatedAt: 1_000,
    summary: {
      owners: ownerCount,
      warningOwners: 0,
      recallEvents: 2,
      compactionRuns: 3,
      qualityStatus: "healthy",
    },
    ownerCards:
      ownerCount > 0
        ? [
            {
              ownerScopeKey: "private_owner_key",
              ownerType: "main_agent",
              ownerId: "private_owner_id",
              sessionId: "private_session_id",
              agentNameSnapshot: "마당쇠",
              currentRawTokenEstimate: 12,
              currentRawMessageCount: 2,
              latestCapsuleAgeMs: null,
              activeCapsuleChainDepth: 1,
              latestRollupAgeMs: null,
              lastCompactionReason: null,
              pendingPreservationCount: 0,
              recallHitCount: 2,
              driftWarningState: "ok",
              driftWarningCodes: [],
              lastCompactionAt: null,
              compactionBlockReason: null,
            },
          ]
        : [],
  } as MemoryInspectorSnapshot
}

const failure = {
  kind: "unavailable",
  reasonCode: "private_memory_adapter_503",
  messageKey: "unavailable",
  action: "refresh_state",
  actionLabelKey: "refresh_state",
} as const

function render(readState: ResourceReadState<MemoryInspectorSnapshot>): string {
  vi.stubGlobal("localStorage", { getItem: () => null })
  return renderToStaticMarkup(
    createElement(MemorySettingsOverviewPanel, {
      readState,
      onRefresh: () => undefined,
    }),
  )
}

describe("Task054 memory overview read UI", () => {
  it("withholds unverified zero summaries on initial failure", () => {
    const html = render({ status: "failed", data: null, observedAt: null, failure })
    expect(html).toContain("설정 정보를 불러오지 못했습니다")
    expect(html).toContain("상태 새로고침")
    expect(html).not.toContain("private_memory_adapter_503")
    expect(html).not.toContain("메모리 대상</div>")
    expect(html.match(/상태 새로고침/g)).toHaveLength(1)
  })

  it("retains the last verified overview after refresh failure", () => {
    const data = snapshot()
    const html = render({ status: "stale", data, observedAt: data.generatedAt, failure })
    expect(html).toContain("이전 정보를 표시하고 있습니다")
    expect(html).toContain("마당쇠")
    expect(html).toContain("압축 실행")
    expect(html).not.toContain("private_owner_key")
    expect(html).not.toContain("private_memory_adapter_503")
    expect(html.match(/상태 새로고침/g)).toHaveLength(1)
  })

  it("distinguishes initial loading and a verified empty result", () => {
    const loading = render({ status: "loading", data: null, observedAt: null, failure: null })
    const emptyData = snapshot(0)
    const empty = render({
      status: "ready",
      data: emptyData,
      observedAt: emptyData.generatedAt,
      failure: null,
    })
    expect(loading).toContain("메모리 상태 불러오는 중")
    expect(loading).not.toContain("메모리 대상</div>")
    expect(empty).toContain("메모리 대상")
    expect(empty).toContain("표시할 메모리 상태가 없습니다")
  })
})
