import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  isDefaultMainAgentAlias,
  mainAgentLabelEn,
  mainAgentLabelKo,
  mainAgentPossessiveEn,
  mainAgentSubjectEn,
  mainAgentSubjectKo,
} from "../packages/webui/src/lib/main-agent-copy.ts"

describe("task1020 webui main-agent copy helper", () => {
  it("centralizes default alias, label, subject, and possessive copy", () => {
    expect(isDefaultMainAgentAlias("Knowbee")).toBe(true)
    expect(isDefaultMainAgentAlias("노비")).toBe(true)
    expect(isDefaultMainAgentAlias("마당쇠")).toBe(false)

    expect(mainAgentLabelKo("Knowbee")).toBe("메인 에이전트")
    expect(mainAgentLabelEn("Knowbee")).toBe("main agent")
    expect(mainAgentSubjectKo("마당쇠")).toBe("마당쇠가")
    expect(mainAgentSubjectKo("봇")).toBe("봇이")
    expect(mainAgentSubjectEn("Knowbee")).toBe("the main agent")
    expect(mainAgentSubjectEn("Knowbee", { sentenceStart: true })).toBe("The main agent")
    expect(mainAgentSubjectEn("Madangsoe")).toBe("Madangsoe")
    expect(mainAgentPossessiveEn("Knowbee")).toBe("the main agent's")
    expect(mainAgentPossessiveEn("Madangsoe")).toBe("Madangsoe's")
  })

  it("keeps topology files free of duplicated main-agent copy helpers", () => {
    const files = [
      "packages/webui/src/lib/executor-graph-relations.ts",
      "packages/webui/src/components/topology/ExecutorCardNode.tsx",
      "packages/webui/src/components/topology/ExecutorCreatePanel.tsx",
      "packages/webui/src/components/topology/ExecutorInspector.tsx",
    ]

    for (const filePath of files) {
      const source = readFileSync(filePath, "utf-8")
      expect(source, filePath).toContain("main-agent-copy")
      expect(source, filePath).not.toMatch(/function\s+isDefaultMainAgentAlias/u)
      expect(source, filePath).not.toMatch(/function\s+hasKoreanFinalConsonant/u)
    }
  })
})
