import { readFileSync, readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1185 GOAL completion maintenance audit", () => {
  it("does not retain the unused legacy nickname validator", () => {
    const source = readFileSync(
      "packages/core/src/contracts/sub-agent-orchestration.ts",
      "utf8",
    )

    expect(source).not.toContain("function hasNonEmptyNickname(")
    expect(source).not.toContain("must be a non-empty nickname")
  })

  it("limits explicit state machines to complex transition-owning flows", () => {
    const agents = readFileSync("AGENTS.md", "utf8")
    const promptHarness = readFileSync(
      "packages/core/src/memory/prompt-improvement-harness.ts",
      "utf8",
    )
    const subSession = readFileSync(
      "packages/core/src/orchestration/sub-session-runner.ts",
      "utf8",
    )
    const workRecord = readFileSync(
      "packages/core/src/contracts/work-record.ts",
      "utf8",
    )
    const configCommand = readFileSync(
      "packages/core/src/config/command-state.ts",
      "utf8",
    )
    const simpleIntake = readFileSync(
      "packages/core/src/runs/intake-bridge-pass.ts",
      "utf8",
    )

    expect(agents).toContain("### 3.4 상태머신 적용 경계")
    expect(agents).toContain("단순 질의응답, 값 변환, projection, validation, 한 번의 adapter 호출에는 상태머신을 추가하지 않는다.")
    expect(agents).toContain("여러 boolean flag나 서로 다른 모듈의 문자열 상태 조합으로 상태머신을 암묵적으로 구현하지 않는다.")

    expect(promptHarness).toContain("PROMPT_IMPROVEMENT_HARNESS_TRANSITIONS")
    expect(subSession).toContain("SUB_SESSION_STATUS_TRANSITIONS")
    expect(workRecord).toContain("WORK_RECORD_STATUS_TRANSITIONS")
    expect(workRecord).toContain("isDeclaredWorkRecordStatusTransition")
    expect(configCommand).toContain("const ALLOWED_TRANSITIONS")

    expect(simpleIntake).not.toMatch(/from ["'][^"']*(?:command-state|operation-lifecycle|prompt-improvement-harness|sub-session-runner|work-record)\.js["']/)
    expect(simpleIntake).not.toContain("createConfigurationCommandStateMachine")
    expect(simpleIntake).not.toContain("PromptImprovementHarnessState")
  })

  it("keeps canonical session and sub-session contracts free of alternate agent names", () => {
    const contracts = readFileSync(
      "packages/core/src/contracts/sub-agent-orchestration.ts",
      "utf8",
    )
    const controls = readFileSync(
      "packages/core/src/orchestration/sub-session-control.ts",
      "utf8",
    )
    const sessionContract = contracts.slice(
      contracts.indexOf("export interface SessionContract"),
      contracts.indexOf("export interface SubSessionContract"),
    )
    const subSessionContract = contracts.slice(
      contracts.indexOf("export interface SubSessionContract"),
      contracts.indexOf("export interface SubSessionMemoryOwnerScope"),
    )
    const subSessionInfo = controls.slice(
      controls.indexOf("export interface SubSessionInfo"),
      controls.indexOf("export interface SubSessionLogEntry"),
    )

    for (const source of [sessionContract, subSessionContract, subSessionInfo]) {
      expect(source).not.toMatch(/agentDisplayName|parentAgentDisplayName|agentNickname|parentAgentNickname/)
    }
    expect(subSessionContract).toContain("agentName: string")
    expect(subSessionContract).toContain("agentNameSnapshot?: string")
    expect(subSessionInfo).toContain("agentName: string")
  })

  it("keeps alternate agent-name fields only in explicit legacy compatibility fixtures", () => {
    const violations: string[] = []
    for (const file of readdirSync("tests").filter((name) => /\.test\.tsx?$/.test(name))) {
      if (file === "task004-storage-migration.test.ts") continue
      const lines = readFileSync(`tests/${file}`, "utf8").split(/\r?\n/u)
      lines.forEach((line, index) => {
        const match = line.match(/^\s*(?:parentAgentDisplayName|agentDisplayName):\s*(.+)$/u)
        if (!match) return
        const value = match[1] ?? ""
        if (/Legacy|legacy|string/u.test(value)) return
        violations.push(`${file}:${index + 1}`)
      })
    }

    expect(violations).toEqual([])
  })
})
