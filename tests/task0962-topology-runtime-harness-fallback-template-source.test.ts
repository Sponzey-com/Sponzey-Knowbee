import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { runTopologyRootRun } from "../packages/core/src/topology-runtime/harness.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import type { EnterpriseTopologyRegistryStore } from "../packages/core/src/topology/registry.ts"

function registryWithoutExport(): EnterpriseTopologyRegistryStore {
  return {
    appendTopologyVersion: () => {
      throw new Error("not used")
    },
    activateTopologyVersion: () => {
      throw new Error("not used")
    },
    rollbackTopologyVersion: () => {
      throw new Error("not used")
    },
    archiveTopology: () => null,
    listTopologies: () => [],
    getTopology: () => null,
    listVersions: () => [],
    getVersion: () => null,
    exportTopology: () => null,
    listHistory: () => [],
  } as EnterpriseTopologyRegistryStore
}

describe("task0962 topology runtime harness prompt source", () => {
  it("registers topology runtime harness text as an internal English source", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const source = registry.find((item) =>
      item.sourceId === "topology_runtime_harness_text_user" && item.locale === "en"
    )

    expect(source).toMatchObject({
      sourceId: "topology_runtime_harness_text_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.content).toContain("## Value")
    expect(source?.content).toContain("root_success_criterion=Produce a result")
    expect(source?.content).toContain("generic_fallback_summary=Topology runtime fallback: {{reasonCode}}.")
    expect(source?.content).toContain("## Out Of Scope")
  })

  it("renders generic topology fallback summary from the prompt source", async () => {
    const result = await runTopologyRootRun({
      decision: {
        mode: "route",
        reasonCode: "explicit_topology_target",
        featureFlagMode: "on",
        topologyId: "topology:missing",
        topologyName: "Missing topology",
        topologyVersion: 1,
        topologyVersionId: "topology-version:missing:1",
        compiledTopologySnapshotId: "compiled:missing:1",
        entryNodeId: "node:entry",
        availableDirectChildExecutorIds: [],
        explicit: true,
      },
      runId: "run:test",
      sessionId: "session:test",
      source: "webui",
      message: "Run missing topology.",
      registry: registryWithoutExport(),
    })

    expect(result.ok).toBe(false)
    expect(result.reasonCode).toBe("topology_export_missing")
    expect(result.fallbackSummary).toBe("Topology runtime fallback: topology_export_missing.")
  })

  it("does not keep topology runtime harness prompt bodies hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/topology-runtime/harness.ts", "utf-8")

    expect(source).toContain("topology_runtime_harness_text_user")
    expect(source).not.toContain("Produce a result that Knowbee can synthesize into the final user answer.")
    expect(source).not.toContain("Use the current-agent fallback contract if topology execution cannot produce a final answer.")
    expect(source).not.toContain("Topology runtime did not produce a completed result; use the current-agent fallback contract.")
    expect(source).not.toContain("Topology runtime fallback: ${reasonCode}.")
  })
})
