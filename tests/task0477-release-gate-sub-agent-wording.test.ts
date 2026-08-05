import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { ENTERPRISE_TOPOLOGY_EXECUTOR_FIRST_HAPPY_PATH } from "../packages/core/src/release/enterprise-topology-release-gate.ts"

describe("release gate sub-agent wording", () => {
  it("describes the first-add happy path with sub-agent settings wording", () => {
    const addStep = ENTERPRISE_TOPOLOGY_EXECUTOR_FIRST_HAPPY_PATH.find((step) => step.id === "add_first_executor")

    expect(addStep?.label).toBe("Click + 서브 에이전트 추가 from the default sub-agent settings surface.")
    expect(addStep?.label).not.toContain("실행자 추가")
    expect(addStep?.label).not.toContain("Executor Graph")
  })

  it("keeps release gate TS and JS sources free from the old add-executor label", () => {
    const combined = [
      readFileSync("packages/core/src/release/enterprise-topology-release-gate.ts", "utf8"),
      readFileSync("packages/core/src/release/enterprise-topology-release-gate.js", "utf8"),
    ].join("\n")

    expect(combined).not.toContain("Click + 실행자 추가")
    expect(combined).not.toContain("default Executor Graph surface")
    expect(combined).toContain("Click + 서브 에이전트 추가")
  })
})
