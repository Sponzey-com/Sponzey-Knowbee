import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "topology", "TopologyImprovePanel.tsx"),
  "utf-8",
)

const nodeLabelStart = source.indexOf("function nodeLabel(")
const nodeLabelEnd = source.indexOf("function userSafeEntityFallback", nodeLabelStart)
if (nodeLabelStart < 0 || nodeLabelEnd < 0) throw new Error("Could not extract nodeLabel")
const nodeLabelSource = source.slice(nodeLabelStart, nodeLabelEnd)

describe("task0378 topology improve node label redaction", () => {
  it("does not allow raw node ids as the node label fallback", () => {
    expect(nodeLabelSource).not.toContain("?? nodeId")
    expect(nodeLabelSource).toContain('"서브 에이전트"')
  })
})
