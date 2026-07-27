import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  ENTERPRISE_TOPOLOGY_WORKSPACE_NO_TYPING_HAPPY_PATH,
  buildEnterpriseTopologyReleaseReadinessSummary,
} from "../packages/core/src/release/enterprise-topology-release-gate.ts"

describe("release gate evidence sub-agent wording", () => {
  it("uses work template and sub-agent-first wording in release evidence", () => {
    const runStrip = ENTERPRISE_TOPOLOGY_WORKSPACE_NO_TYPING_HAPPY_PATH.find((step) => step.id === "run_strip")
    const summary = buildEnterpriseTopologyReleaseReadinessSummary()
    const workspaceGate = summary.checks.find((check) => check.id === "topology_workspace_executor_first_usability")
    const usabilityCommand = summary.regressionCommands.find((command) => command.id === "topology_workspace_usability_gate")

    expect(runStrip?.label).toBe("Run from the simple input strip while the work template and context remain internally inferred.")
    expect(workspaceGate?.title).toBe("Topology Workspace sub-agent-first usability")
    expect(usabilityCommand?.description).toContain("sub-agent-first usability")
  })

  it("keeps release source and runbook free from old executor-first and WorkOrder wording", () => {
    const combined = [
      readFileSync("packages/core/src/release/enterprise-topology-release-gate.ts", "utf8"),
      readFileSync("packages/core/src/release/enterprise-topology-release-gate.js", "utf8"),
      readFileSync("docs/release-runbook.md", "utf8"),
    ].join("\n")

    expect(combined).not.toContain("Executor-first usability")
    expect(combined).not.toContain("WorkOrder template")
    expect(combined).not.toContain("WorkOrder/manual run")
    expect(combined).not.toContain("WorkOrder id")
    expect(combined).not.toContain("NodeContract id")
    expect(combined).toContain("sub-agent-first usability")
    expect(combined).toContain("work template")
  })
})
