import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function readRepoFile(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf-8")
}

describe("task1010 setup deferred copy specificity", () => {
  it("keeps remote access setup copy specific about optional use and location", () => {
    const setupPage = readRepoFile("packages", "webui", "src", "pages", "SetupPage.tsx")
    const stepMeta = readRepoFile("packages", "webui", "src", "lib", "setup-step-meta.ts")
    const messageCatalog = readRepoFile("packages", "webui", "src", "lib", "message-catalog.ts")
    const combined = [setupPage, stepMeta, messageCatalog].join("\n")

    expect(combined).not.toContain("나중에 설정해도 됩니다")
    expect(combined).not.toContain("지금 필요 없다면 나중에")
    expect(messageCatalog).not.toContain('ko: "나중에"')
    expect(messageCatalog).toContain("채널과 내 컴퓨터 연결은 필요할 때 켜면 됩니다")
    expect(stepMeta).toContain("다른 기기에서 접속해야 할 때만 설정합니다")
    expect(stepMeta).toContain("로컬에서만 사용할 경우 선택하지 않고 넘어갑니다")
    expect(messageCatalog).toContain('ko: "선택 안 함"')
  })
})
