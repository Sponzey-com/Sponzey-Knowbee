import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { executorFriendlyRuntimeLabel } from "../packages/webui/src/components/topology/ExecutorInspector.tsx"

const topologyWorkspaceSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "topology", "TopologyWorkspaceInspector.tsx"),
  "utf-8",
)
const executorInspectorSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "topology", "ExecutorInspector.tsx"),
  "utf-8",
)
const resultPanelSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "topology", "ExecutorRunResultPanel.tsx"),
  "utf-8",
)

describe("task0418 external tool execution wording", () => {
  it("uses external tool execution for executor runtime labels", () => {
    expect(executorFriendlyRuntimeLabel("tool_execution")).toBe("외부 도구 실행")
    expect(executorInspectorSource).not.toContain('"도구 실행" | "외부 처리"')
    expect(executorInspectorSource).not.toContain('return "도구 실행"')

    expect(executorInspectorSource).toContain('"외부 도구 실행" | "외부 처리"')
    expect(executorInspectorSource).toContain('return "외부 도구 실행"')
  })

  it("uses external tool execution for workspace executor options", () => {
    expect(topologyWorkspaceSource).not.toContain('labelKo: "도구 실행"')
    expect(topologyWorkspaceSource).not.toContain('labelEn: "Tool execution"')
    expect(topologyWorkspaceSource).not.toContain('descriptionKo: "도구 실행으로 처리되는 자동화 단계입니다."')
    expect(topologyWorkspaceSource).not.toContain('descriptionEn: "This step is executed through a tool."')

    expect(topologyWorkspaceSource).toContain('labelKo: "외부 도구 실행"')
    expect(topologyWorkspaceSource).toContain('labelEn: "External tool execution"')
    expect(topologyWorkspaceSource).toContain('descriptionKo: "외부 도구로 처리되는 자동화 단계입니다."')
    expect(topologyWorkspaceSource).toContain('descriptionEn: "This step is executed through an external tool."')
  })

  it("uses external tool execution in result attempted-action labels", () => {
    expect(resultPanelSource).not.toContain('add("도구 실행", "Tool execution")')

    expect(resultPanelSource).toContain('add("외부 도구 실행", "External tool execution")')
  })
})
