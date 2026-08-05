import { describe, expect, it } from "vitest"
import { buildDashboardStorageCardView } from "../packages/webui/src/pages/DashboardPage.tsx"

describe("task0360 dashboard storage status", () => {
  it("summarizes storage without exposing internal path labels or values", () => {
    const view = buildDashboardStorageCardView({
      language: "ko",
      setupCompleted: true,
      statusPaths: {
        stateDir: "[internal-path-redacted]",
        configFile: "[internal-path-redacted]",
        dbFile: "[internal-path-redacted]",
        setupStateFile: "[internal-path-redacted]",
      },
      checks: {
        stateDir: "/Users/demo/.knowbee",
        configFile: "/Users/demo/.knowbee/config.json5",
        setupStateFile: "/Users/demo/.knowbee/setup-state.json",
        setupCompleted: true,
        telegramConfigured: true,
        authEnabled: true,
        schedulerEnabled: true,
      },
    })

    expect(view.title).toBe("로컬 저장소")
    expect(view.rows.map((row) => row.label)).toEqual(["상태", "데이터", "설정", "보호"])
    expect(view.rows.map((row) => row.value)).toEqual(["사용 준비됨", "로컬에 보관됨", "저장됨", "내부 세부 정보 숨김"])

    const serialized = JSON.stringify(view)
    expect(serialized).not.toContain("[internal-path-redacted]")
    expect(serialized).not.toContain("/Users/demo/.knowbee")
    expect(serialized).not.toMatch(/State Dir|Config File|Setup State|DB File/i)
  })

  it("uses clear fallback wording when storage signals are missing", () => {
    const view = buildDashboardStorageCardView({
      language: "en",
      setupCompleted: false,
      statusPaths: undefined,
      checks: undefined,
    })

    expect(view.title).toBe("Local storage")
    expect(view.rows).toEqual([
      { label: "Status", value: "Needs setup" },
      { label: "Data", value: "Needs check" },
      { label: "Configuration", value: "Needs check" },
      { label: "Protection", value: "Internal details hidden" },
    ])
  })
})
