import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "YeonjangFleetPanel.tsx"),
  "utf-8",
)

const start = source.indexOf("function GovernanceHistory(")
const end = source.indexOf("export function YeonjangFleetPanel(", start)
if (start < 0 || end < 0) throw new Error("Could not extract GovernanceHistory")
const governanceHistorySource = source.slice(start, end)

describe("task0375 Yeonjang governance history ID redaction", () => {
  it("renders actor and workspace scope as states instead of raw identifiers", () => {
    expect(governanceHistorySource).not.toContain("{item.actor}</span>")
    expect(governanceHistorySource).not.toContain("{item.workspaceScopeId}</span>")
    expect(governanceHistorySource).toContain("처리자 기록 있음")
    expect(governanceHistorySource).toContain("작업 범위 연결됨")
  })
})
