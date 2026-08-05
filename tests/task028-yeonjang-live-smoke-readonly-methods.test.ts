import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { produceYeonjangLiveAcceptanceEvidence } from "../packages/core/src/release/yeonjang-live-acceptance-evidence.ts"
import {
  type YeonjangLiveSmokeSelection,
  runYeonjangLiveSmokeScenario,
} from "../packages/core/src/runs/yeonjang-live-smoke-runner.ts"

const NOW = Date.parse("2026-07-21T09:00:00.000Z")
const RUN_ID = "yeonjang-run:028"
const EVIDENCE_REF = `tool-result:yeonjang:${"c".repeat(64)}`

function selection(method: string): YeonjangLiveSmokeSelection {
  return {
    scenario: {
      id: `office-mac-${method.replaceAll(".", "-")}`,
      expectedInstanceId: "instance:office-mac",
      expectedSessionId: "session:office-mac:28",
      expectedMethod: method as "system.info",
      readOnly: true,
    },
    instance: {
      instanceId: "instance:office-mac",
      publicName: "Office Mac",
      sessionId: "session:office-mac:28",
      status: "connected",
      observedAt: NOW - 500,
      duplicateActiveIdentityCount: 0,
      trustState: "trusted",
      runnableTarget: true,
    },
  }
}

function observed(method: string) {
  return {
    command: {
      runId: RUN_ID,
      requestGroupId: RUN_ID,
      commandId: "command:028",
      instanceId: "instance:office-mac",
      sessionId: "session:office-mac:28",
      method,
      readOnly: true,
      deliveryStatus: "acked" as const,
    },
    observedResult: {
      runId: RUN_ID,
      commandId: "command:028",
      instanceId: "instance:office-mac",
      sessionId: "session:office-mac:28",
      status: "observed" as const,
      evidenceRef: EVIDENCE_REF,
    },
    auditEventId: "audit:yeonjang:028",
    diagnosisPayload: Object.freeze({ devices: [] }),
  }
}

function diagnosis(evidenceRef = EVIDENCE_REF) {
  return {
    diagnosedBy: "llm" as const,
    status: "complete" as const,
    contextFingerprint: `sha256:${"d".repeat(64)}` as const,
    criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
    evidenceRefs: [evidenceRef],
  }
}

describe("Task 028 Yeonjang live smoke read-only methods", () => {
  it("accepts camera.list as a read-only live smoke method after LLM diagnosis", async () => {
    const result = await runYeonjangLiveSmokeScenario({
      runId: RUN_ID,
      selection: selection("camera.list"),
      execute: vi.fn(async () => observed("camera.list")),
      diagnose: vi.fn(async ({ evidenceRef }) => diagnosis(evidenceRef)),
      maxInstanceAgeMs: 5_000,
      now: () => NOW,
      signal: new AbortController().signal,
    })

    expect(result.status).toBe("passed")
    expect(result.results[0]?.trace?.command?.method).toBe("camera.list")
    expect(
      produceYeonjangLiveAcceptanceEvidence({
        run: result,
        now: NOW,
        maxSessionAgeMs: 5_000,
      }).accepted,
    ).toContainEqual(
      expect.objectContaining({ scenarioId: "office-mac-camera-list", terminalStatus: "passed" }),
    )
  })

  it("rejects side-effect methods before transport dispatch", async () => {
    const execute = vi.fn()
    const result = await runYeonjangLiveSmokeScenario({
      runId: RUN_ID,
      selection: selection("system.exec"),
      execute,
      diagnose: vi.fn(),
      maxInstanceAgeMs: 5_000,
      now: () => NOW,
      signal: new AbortController().signal,
    })

    expect(result.status).toBe("failed")
    expect(result.results[0]?.reasonCode).toBe("yeonjang_smoke_scenario_invalid")
    expect(execute).not.toHaveBeenCalled()
  })

  it("uses a named read-only allowlist instead of a system.info-only branch", () => {
    const runnerSource = readFileSync(
      "packages/core/src/runs/yeonjang-live-smoke-runner.ts",
      "utf8",
    )
    const evidenceSource = readFileSync(
      "packages/core/src/release/yeonjang-live-acceptance-evidence.ts",
      "utf8",
    )

    expect(runnerSource).toContain("isYeonjangLiveSmokeReadOnlyMethod")
    expect(evidenceSource).toContain("isYeonjangLiveSmokeReadOnlyMethod")
    expect(runnerSource).not.toContain('scenario.expectedMethod !== "system.info"')
    expect(evidenceSource).not.toContain('scenario.expectedMethod !== "system.info"')
  })
})
