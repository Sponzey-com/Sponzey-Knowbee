import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "MemoryInspectorPanel.tsx"),
  "utf-8",
)

describe("task0443 memory inspector redaction", () => {
  it("hides raw restore prompt blocks and rollup capsule ids from the default UI", () => {
    expect(source).not.toContain("<pre")
    expect(source).not.toContain("{snapshot.maintenanceRestorePromptBlock}")
    expect(source).not.toContain("{actionResult.maintenanceRestorePromptBlock}")
    expect(source).not.toContain("displayText(actionResult.latestRollup.resultRollupCapsuleId)")
    expect(source).toContain("hiddenRecordSummary(text, snapshot.maintenanceRestorePromptBlock)")
    expect(source).toContain("hiddenRecordSummary(text, actionResult.maintenanceRestorePromptBlock)")
    expect(source).toContain('text("묶음 압축 메모리 기록 있음", "Rollup memory record exists")')
  })

  it("summarizes memory preview content without rendering raw preserved items or capsule summaries", () => {
    expect(source).not.toContain("snapshot.compactPreview.preservedPinnedItems.slice")
    expect(source).not.toContain("displayText(snapshot.compactPreview.capsuleSummary")
    expect(source).not.toContain("displayText(actionResult.compactPreview.capsuleSummary")
    expect(source).not.toContain("displayText(actionResult.latestCapsule.summary)")
    expect(source).toContain('text("보존 고정 항목", "Preserved pinned items")')
    expect(source).toContain('text("압축 요약 미리보기 기록 있음", "Compaction summary preview recorded")')
    expect(source).toContain('text("압축 메모리 기록 있음", "Compacted memory record exists")')
  })

  it("uses user-facing labels instead of raw memory states and raw token wording", () => {
    expect(source).not.toContain('text("원문 토큰", "Raw tokens")')
    expect(source).not.toContain("{card.ownerType}</span>")
    expect(source).not.toContain("{card.driftWarningState}")
    expect(source).not.toContain("return action")
    expect(source).toContain('text("최근 대화 크기", "Recent context size")')
    expect(source).toContain("ownerTypeLabel(text, card.ownerType)")
    expect(source).toContain("memoryStateLabel(text, card.driftWarningState)")
  })
})
