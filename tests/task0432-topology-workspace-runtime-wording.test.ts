import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const canvasSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "topology", "TopologyWorkspaceCanvas.tsx"),
  "utf-8",
)
const inspectorSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "topology", "TopologyWorkspaceInspector.tsx"),
  "utf-8",
)

describe("task0432 topology workspace runtime wording", () => {
  it("formats runtime resource canvas summaries with user-facing labels", () => {
    expect(canvasSource).not.toContain("Trace path")
    expect(canvasSource).not.toContain("team capability inherited")
    expect(canvasSource).not.toContain("capability unknown")
    expect(canvasSource).not.toContain("model unknown")
    expect(canvasSource).not.toContain("member models available")
    expect(canvasSource).not.toContain("no member model")
    expect(canvasSource).not.toContain("no diagnostics")
    expect(canvasSource).not.toContain("Health: ${")
    expect(canvasSource).not.toContain("Capability: ${")
    expect(canvasSource).not.toContain("Model: ${")

    expect(canvasSource).toContain("function runtimeStatusDisplayLabel")
    expect(canvasSource).toContain("function capabilityAvailabilityDisplayLabel")
    expect(canvasSource).toContain("function modelAvailabilityDisplayLabel")
    expect(canvasSource).toContain("function formatResourceTooltip")
    expect(canvasSource).toContain("상태:")
    expect(canvasSource).toContain("기능:")
    expect(canvasSource).toContain("모델:")
    expect(canvasSource).toContain("팀 기능 상속")
    expect(canvasSource).toContain("기능 확인 필요")
    expect(canvasSource).toContain("모델 확인 필요")
    expect(canvasSource).toContain("진단 없음")
  })

  it("formats runtime executor picker descriptions with user-facing labels", () => {
    expect(inspectorSource).not.toContain("model unknown")
    expect(inspectorSource).not.toContain("active members")
    expect(inspectorSource).not.toContain("capability ${capability}")
    expect(inspectorSource).not.toContain("tools ${agent.tools.enabledCount}")
    expect(inspectorSource).not.toContain("{selectedData.status}")

    expect(inspectorSource).toContain("function runtimeStatusDisplayLabel")
    expect(inspectorSource).toContain("function capabilityAvailabilityDisplayLabel")
    expect(inspectorSource).toContain("function modelAvailabilityDisplayLabel")
    expect(inspectorSource).toContain("사용 가능 인원")
    expect(inspectorSource).toContain("기능 ${capability}")
    expect(inspectorSource).toContain("외부 도구 ${agent.tools.enabledCount}")
    expect(inspectorSource).toContain("runtimeStatusDisplayLabel(selectedData.status)")
  })
})

