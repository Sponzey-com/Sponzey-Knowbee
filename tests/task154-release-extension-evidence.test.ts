import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"
import { closeDb } from "../packages/core/src/db/index.js"
import { buildReleaseManifest } from "../packages/core/src/release/package.ts"
import type {
  ExtensionLiveCapability,
  ExtensionLiveSmokeResult,
  ExtensionLiveSmokeSummary,
} from "../packages/core/src/runs/extension-live-smoke.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

const NOW = Date.parse("2026-07-17T05:00:00.000Z")
const EVIDENCE_REF = `tool-result:extension:${"b".repeat(64)}`

beforeEach(() => closeDb())

function result(
  capability: ExtensionLiveCapability,
  runId: string,
  finishedAt: number,
): ExtensionLiveSmokeResult {
  const catalogId = `${capability}:weather`
  return {
    scenario: {
      id: `${capability}-read-only-call`,
      capability,
      expectedAgentId: "agent:main",
      expectedBindingId: `binding:${catalogId}`,
      expectedCatalogId: catalogId,
      expectedToolName: "weather.read",
      readOnly: true,
    },
    state: "verified",
    status: "passed",
    trace: {
      requestGroupId: runId,
      selectedCapability: capability,
      selectedAgentId: "agent:main",
      selectedBindingId: `binding:${catalogId}`,
      selectedCatalogId: catalogId,
      discoveryOnly: false,
      toolExecution: {
        runId,
        requestGroupId: runId,
        capability,
        agentId: "agent:main",
        bindingId: `binding:${catalogId}`,
        catalogId,
        toolName: "weather.read",
        status: "succeeded",
        executionObserved: true,
        evidenceRef: EVIDENCE_REF,
      },
      resultDiagnosis: {
        diagnosedBy: "llm",
        status: "complete",
        contextFingerprint: `sha256:${"a".repeat(64)}`,
        criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
        evidenceRefs: [EVIDENCE_REF],
      },
      auditEventId: `audit:${capability}:154`,
      redactionStatus: "verified",
    },
    startedAt: finishedAt - 1_000,
    finishedAt,
  }
}

function run(runId = "extension-run:release-154", finishedAt = NOW): ExtensionLiveSmokeSummary {
  return {
    kind: "extension.live_smoke",
    mode: "live-run",
    runId,
    status: "passed",
    startedAt: finishedAt - 2_000,
    finishedAt,
    results: [result("skill", runId, finishedAt), result("mcp", runId, finishedAt)],
  }
}

describe("Task 154 release extension evidence integration", () => {
  it("admits separate Skill and MCP evidence with a bounded production summary", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task154-release-"))
    try {
      const runtime = createTestRuntimeConfigFixture({ rootDir })
      const manifest = buildReleaseManifest({
        rootDir,
        runtimePaths: runtime.paths,
        targetPlatforms: [],
        requiredLiveCapabilities: ["skill", "mcp"],
        extensionLiveSmokeRuns: [run()],
        now: new Date(NOW),
        liveAcceptanceMaxAgeMs: 1_000,
      })
      expect(manifest.liveAcceptance).toMatchObject({
        status: "admitted",
        acceptedEvidenceRefs: [
          "extension-smoke:extension-run:release-154:skill-read-only-call",
          "extension-smoke:extension-run:release-154:mcp-read-only-call",
        ],
      })
      expect(manifest.extensionLiveAcceptanceProduction).toEqual({
        acceptedCounts: { skill: 1, mcp: 1 },
        rejected: [],
      })
      expect(JSON.stringify(manifest.extensionLiveAcceptanceProduction)).not.toMatch(
        /weather|agent:main|binding|tool-result|contextFingerprint/u,
      )
    } finally {
      closeDb()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  it("blocks catalog/discovery-only receipts with bounded reasons", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task154-discovery-"))
    try {
      const runtime = createTestRuntimeConfigFixture({ rootDir })
      const input = run()
      const skill = input.results[0]
      const mcp = input.results[1]
      if (!skill?.trace || !mcp?.trace) throw new Error("missing Task 154 trace fixture")
      const manifest = buildReleaseManifest({
        rootDir,
        runtimePaths: runtime.paths,
        targetPlatforms: [],
        requiredLiveCapabilities: ["skill", "mcp"],
        extensionLiveSmokeRuns: [
          {
            ...input,
            results: [
              { ...skill, trace: { ...skill.trace, toolExecution: null } },
              { ...mcp, trace: { ...mcp.trace, discoveryOnly: true } },
            ],
          },
        ],
        now: new Date(NOW),
        liveAcceptanceMaxAgeMs: 1_000,
      })
      expect(manifest.liveAcceptance.status).toBe("blocked")
      expect(manifest.extensionLiveAcceptanceProduction).toEqual({
        acceptedCounts: { skill: 0, mcp: 0 },
        rejected: [
          {
            scenarioId: "skill-read-only-call",
            capability: "skill",
            reasonCode: "extension_smoke_tool_receipt_missing",
          },
          {
            scenarioId: "mcp-read-only-call",
            capability: "mcp",
            reasonCode: "extension_smoke_discovery_only",
          },
        ],
      })
    } finally {
      closeDb()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  it("does not let an older Skill success hide the latest failed scenario", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task154-latest-failed-"))
    try {
      const runtime = createTestRuntimeConfigFixture({ rootDir })
      const accepted = run("extension-run:old", NOW - 1_000)
      const latest = run("extension-run:latest", NOW)
      const latestSkill = latest.results[0]
      if (!latestSkill) throw new Error("missing Task 154 Skill fixture")
      const manifest = buildReleaseManifest({
        rootDir,
        runtimePaths: runtime.paths,
        targetPlatforms: [],
        requiredLiveCapabilities: ["skill", "mcp"],
        extensionLiveSmokeRuns: [
          accepted,
          {
            ...latest,
            status: "failed",
            results: [{ ...latestSkill, state: "rejected", status: "failed" }],
          },
        ],
        now: new Date(NOW),
        liveAcceptanceMaxAgeMs: 5_000,
      })
      expect(manifest.liveAcceptance.status).toBe("blocked")
      expect(manifest.extensionLiveAcceptanceProduction.acceptedCounts).toEqual({
        skill: 0,
        mcp: 1,
      })
    } finally {
      closeDb()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})
