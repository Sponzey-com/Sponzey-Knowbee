import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  ENTERPRISE_TOPOLOGY_EXECUTOR_FIRST_HAPPY_PATH,
  buildEnterpriseTopologyReleaseReadinessSummary,
} from "../packages/core/src/release/enterprise-topology-release-gate.ts"

describe("release gate happy path sub-agent wording", () => {
  it("uses sub-agent wording in user-visible happy path labels", () => {
    const labels = ENTERPRISE_TOPOLOGY_EXECUTOR_FIRST_HAPPY_PATH.map((step) => step.label)

    expect(labels).toContain("Type the sub-agent name.")
    expect(labels).toContain("Type only what the sub-agent does; the main agent infers runtime mode, tools, outputs, and success criteria.")
    expect(labels).toContain("Review what the main agent understood and confirm or revise it before execution.")
    expect(labels).toContain("Add a second sub-agent using the same name and work fields.")
    expect(labels).toContain("Connect sub-agents through Smart Connect recommendation chips instead of typing relation labels.")
    expect(labels.join("\n")).not.toContain("executor name")
    expect(labels.join("\n")).not.toContain("executor work")
    expect(labels.join("\n")).not.toContain("second executor")
    expect(labels.join("\n")).not.toContain("Connect executors")
    expect(labels.join("\n")).not.toContain("Knowbee infers")
    expect(labels.join("\n")).not.toContain("메인 에이전트가 이해한 내용")
    expect(labels.join("\n")).not.toContain("WorkOrder template")
  })

  it("uses sub-agent wording in the release gate summary and runbook", () => {
    const summary = buildEnterpriseTopologyReleaseReadinessSummary()
    const gate = summary.checks.find((check) => check.id === "topology_workspace_executor_first_usability")
    const runbook = readFileSync("docs/release-runbook.md", "utf8")
    const combined = [
      readFileSync("packages/core/src/release/enterprise-topology-release-gate.ts", "utf8"),
      readFileSync("packages/core/src/release/enterprise-topology-release-gate.js", "utf8"),
      runbook,
    ].join("\n")

    expect(gate?.summary).toBe("The default happy path only asks for sub-agent name, what the sub-agent does, and run input while internal topology safety remains gated.")
    expect(runbook).toContain("Sub-agent-first usability gate")
    expect(runbook).toContain("sub-agent name, what the sub-agent does, and run input")
    expect(combined).not.toContain("executor name, executor work, and run input")
    expect(combined).not.toContain("simple Executor Graph surface")
    expect(combined).not.toContain("WorkOrder Template")
    expect(combined).not.toContain("WorkOrder template")
    expect(combined).not.toContain("Executor-first usability")
  })
})
