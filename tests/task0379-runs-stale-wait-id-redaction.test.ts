import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "pages", "RunsPage.tsx"),
  "utf-8",
)

const staleStart = source.indexOf('text("오래된 대기", "Old waits")')
const staleEnd = source.indexOf("function MemoryTracePanel(", staleStart)
if (staleStart < 0 || staleEnd < 0) throw new Error("Could not extract stale wait panel")
const stalePanelSource = source.slice(staleStart, staleEnd)

describe("task0379 runs stale wait ID redaction", () => {
  it("does not render stale wait run ids directly in the runs page", () => {
    expect(stalePanelSource).not.toContain("{item.runId} ·")
    expect(stalePanelSource).toContain("실행 항목 연결됨")
  })
})
