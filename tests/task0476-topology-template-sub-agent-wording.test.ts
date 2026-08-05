import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { TOPOLOGY_TEMPLATE_CATALOG } from "../packages/core/src/topology/templates.ts"
import { TOPOLOGY_RELATION_TEMPLATE_CATALOG } from "../packages/core/src/topology/relation-templates.ts"

describe("topology template sub-agent wording", () => {
  it("uses sub-agent wording for node template labels and default names", () => {
    expect(TOPOLOGY_TEMPLATE_CATALOG.nodePresets.map((item) => item.defaultNameKo)).toEqual([
      "새 서브 에이전트",
      "새 검토 서브 에이전트",
      "새 자동화 서브 에이전트",
    ])
    expect(TOPOLOGY_TEMPLATE_CATALOG.nodePresets.map((item) => item.labelKo)).toEqual([
      "서브 에이전트",
      "검토 서브 에이전트",
      "자동화 서브 에이전트",
    ])
  })

  it("uses sub-agent wording for relation template descriptions", () => {
    const descriptionByType = Object.fromEntries(
      TOPOLOGY_RELATION_TEMPLATE_CATALOG.presets.map((item) => [item.relationType, item.descriptionKo]),
    )

    expect(descriptionByType.delegates_to).toBe("실행 가능한 서브 에이전트 간 위임 경로")
    expect(descriptionByType.uses_tool).toBe("서브 에이전트가 도구를 사용")
    expect(descriptionByType.uses_system).toBe("서브 에이전트 또는 프로세스가 시스템을 사용")
  })

  it("keeps template and GUI fallback sources free from old work-node defaults", () => {
    const combined = [
      readFileSync("packages/core/src/topology/templates.ts", "utf8"),
      readFileSync("packages/core/src/topology/templates.js", "utf8"),
      readFileSync("packages/core/src/topology/gui-operations.ts", "utf8"),
      readFileSync("packages/core/src/topology/gui-operations.js", "utf8"),
      readFileSync("packages/core/src/topology/relation-templates.ts", "utf8"),
      readFileSync("packages/core/src/topology/relation-templates.js", "utf8"),
      readFileSync("packages/webui/src/components/topology/RelationModeToolbar.tsx", "utf8"),
    ].join("\n")

    expect(combined).not.toContain("새 업무 노드")
    expect(combined).not.toContain("New work node")
    expect(combined).not.toContain("업무 노드")
    expect(combined).not.toContain("work nodes")
  })
})
