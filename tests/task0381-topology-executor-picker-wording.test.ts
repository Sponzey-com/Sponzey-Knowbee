import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "topology", "TopologyWorkspaceInspector.tsx"),
  "utf-8",
)

const pickerStart = source.indexOf("export function TopologyWorkspaceExecutorPicker(")
const pickerEnd = source.indexOf("function TaskSettings(", pickerStart)
if (pickerStart < 0 || pickerEnd < 0) throw new Error("Could not extract topology executor picker source")
const pickerSource = source.slice(pickerStart, pickerEnd)

describe("task0381 topology executor picker wording", () => {
  it("does not expose implementation contract terms in user-facing guidance", () => {
    expect(pickerSource).not.toContain("NodeContract")
    expect(pickerSource).not.toContain("AgentConfig")
    expect(pickerSource).not.toContain("runtime profile reference")
    expect(pickerSource).not.toContain("source of truth")
    expect(pickerSource).not.toContain("Tool/Data/Group")
    expect(pickerSource).not.toContain("sub-agent source")
    expect(pickerSource).toContain("서브 에이전트의 실행 연결 정보")
    expect(pickerSource).toContain("Tools, data, and groups are referenced resources")
  })
})
