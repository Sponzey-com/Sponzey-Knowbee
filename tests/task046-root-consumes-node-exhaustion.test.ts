import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { buildCanonicalTopologyTerminalReport } from "../packages/core/src/runs/canonical-runtime-result-report.ts"

describe("Task 046 root consumes node exhaustion", () => {
  it("requires every post-node production layer to consume the typed terminal stop", () => {
    const harness = readFileSync("packages/core/src/topology-runtime/harness.ts", "utf8")
    const canonical = readFileSync("packages/core/src/runs/canonical-topology-lifecycle.ts", "utf8")
    const rootDriver = readFileSync("packages/core/src/runs/root-run-driver.ts", "utf8")

    expect(harness).toMatch(/runtimeResult\.terminalStopDecision/u)
    expect(canonical).toMatch(/terminalStopDecision/u)
    expect(rootDriver).toMatch(/execution\.runtimeResult\?\.terminalStopDecision/u)
    expect(rootDriver).toMatch(
      /topologyExecution\.reasonCode === "topology_runtime_terminal_stop"\) return/u,
    )
  })

  it("builds localized terminal facts without exposing unresolved internal identifiers", () => {
    const report = buildCanonicalTopologyTerminalReport({
      runId: "run:terminal",
      primaryLanguage: "ko",
      decision: {
        status: "stop_and_report",
        reasonCode: "solution_paths_exhausted",
        reportInput: {
          goalId: "goal:terminal",
          reasonCode: "solution_paths_exhausted",
          diagnosisReceiptId: "diagnosis:terminal",
          evidenceRefs: ["evidence:web:current-price"],
          unresolvedItemIds: ["criterion:internal-current-price"],
          partialResultRefs: [],
          nextActions: [],
        },
      },
    })

    expect(report.outcome).toBe("impossible")
    expect(report.unresolvedScope).toEqual(["미완료 항목 1"])
    expect(JSON.stringify(report.unresolvedScope)).not.toContain("internal-current-price")
    expect(report.nextActions).toHaveLength(1)
  })
})
