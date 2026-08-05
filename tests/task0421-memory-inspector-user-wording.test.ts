import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(join(process.cwd(), "packages", "webui", "src", "components", "setup", "MemoryInspectorPanel.tsx"), "utf-8")

describe("task0421 memory inspector user wording", () => {
  it("uses user-facing memory action labels", () => {
    expect(source).not.toContain('text("dry-run compact", "Dry-run compact")')
    expect(source).not.toContain('text("최신 capsule", "Latest capsule")')
    expect(source).not.toContain('text("rollup 보기", "Inspect rollup")')
    expect(source).not.toContain('text("safe restore", "Safe restore")')
    expect(source).not.toContain('text("강제 compact", "Force compact")')
    expect(source).not.toContain('text("capsule 무효화", "Invalidate capsule")')

    expect(source).toContain('text("압축 미리보기", "Dry-run compaction")')
    expect(source).toContain('text("최신 압축 메모리", "Latest compacted memory")')
    expect(source).toContain('text("묶음 요약 보기", "Inspect rollup")')
    expect(source).toContain('text("복원 미리보기", "Safe restore")')
    expect(source).toContain('text("지금 압축", "Force compaction")')
    expect(source).toContain('text("압축 메모리 해제", "Invalidate compacted memory")')
  })

  it("uses user-facing memory overview labels", () => {
    expect(source).not.toContain('text("Memory inspector", "Memory inspector")')
    expect(source).not.toContain("compact 상태, capsule chain, recall trace, compaction audit")
    expect(source).not.toContain('text("Owner", "Owner")')
    expect(source).not.toContain('text("raw tokens", "raw tokens")')
    expect(source).not.toContain('text("capsule", "capsule")')
    expect(source).not.toContain('text("drift", "drift")')

    expect(source).toContain('text("메모리 점검", "Memory inspection")')
    expect(source).toContain("압축 상태, 압축 메모리 흐름, 불러온 기록, 압축 이력")
    expect(source).toContain('text("대상", "Owner")')
    expect(source).toContain('text("최근 대화 크기", "Recent context size")')
    expect(source).not.toContain('text("원문 토큰", "Raw tokens")')
    expect(source).toContain('text("압축", "Compacted")')
    expect(source).toContain('text("변화", "Drift")')
  })

  it("uses user-facing labels for preview, restore, audit, and admin controls", () => {
    expect(source).not.toContain('text("Compact preview", "Compact preview")')
    expect(source).not.toContain('text("Restore trace", "Restore trace")')
    expect(source).not.toContain('text("Compaction audit", "Compaction audit")')
    expect(source).not.toContain('text("Manual controls", "Manual controls")')
    expect(source).not.toContain('text("rollup capsule", "Rollup capsule")')

    expect(source).toContain('text("압축 미리보기", "Compaction preview")')
    expect(source).toContain('text("복원 기록", "Restore record")')
    expect(source).not.toContain('text("복원 기록", "Restore trace")')
    expect(source).toContain('text("압축 이력", "Compaction audit")')
    expect(source).toContain('text("관리자 조작", "Manual controls")')
    expect(source).toContain('text("묶음 압축 메모리 기록 있음", "Rollup memory record exists")')
    expect(source).not.toContain('text("묶음 압축 메모리", "Rollup capsule")')
  })
})
