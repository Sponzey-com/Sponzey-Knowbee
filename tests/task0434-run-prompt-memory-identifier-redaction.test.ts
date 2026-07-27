import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const runSummarySource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "runs", "RunSummaryPanel.tsx"),
  "utf-8",
)
const runsPageSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "pages", "RunsPage.tsx"), "utf-8")

describe("task0434 run prompt and memory identifier redaction", () => {
  it("summarizes prompt source snapshots without exposing source ids or checksums in run summary", () => {
    expect(runSummarySource).not.toContain("describePromptSourceSnapshot")
    expect(runSummarySource).not.toContain("sourceId@")
    expect(runSummarySource).not.toContain("sourceId}#")
    expect(runSummarySource).not.toContain('label={text("프롬프트 소스", "Prompt sources")}')
    expect(runSummarySource).not.toContain("checksum.slice")

    expect(runSummarySource).toContain("function countPromptSourceSnapshot")
    expect(runSummarySource).toContain('label={text("내부 지침 기준", "Instruction baseline")}')
    expect(runSummarySource).toContain("baselines linked")
  })

  it("summarizes applied internal instructions without exposing prompt source lists", () => {
    expect(runsPageSource).not.toContain("diagnostics.promptSourceIds.join")
    expect(runsPageSource).not.toContain("source.sourceId")
    expect(runsPageSource).not.toContain("source.checksum")
    expect(runsPageSource).not.toContain("source.version")
    expect(runsPageSource).not.toContain("source.locale")

    expect(runsPageSource).toContain("const promptSourceCount = diagnostics?.promptSources.length ?? diagnostics?.promptSourceIds.length ?? 0")
    expect(runsPageSource).toContain("baselines recorded")
  })

  it("shows memory access trace status without rendering chunk ids or source checksums", () => {
    expect(runsPageSource).not.toContain("source checksum")
    expect(runsPageSource).not.toContain("source checksums")
    expect(runsPageSource).not.toContain("memory chunk")
    expect(runsPageSource).not.toContain('text("청크", "Chunk")')
    expect(runsPageSource).not.toContain('text("체크섬", "Checksum")')
    expect(runsPageSource).not.toContain("displayText(trace.chunk_id")
    expect(runsPageSource).not.toContain("displayText(checksum)")

    expect(runsPageSource).toContain('text("메모리 참조", "Memory reference")')
    expect(runsPageSource).toContain('text("출처 검증", "Source verification")')
    expect(runsPageSource).toContain('text("검증 기준 연결됨", "Verification linked")')
  })
})

