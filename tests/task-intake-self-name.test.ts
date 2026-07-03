import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { reloadConfig } from "../packages/core/src/config/index.js"

const aiMocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
}))

vi.mock("../packages/core/src/ai/index.js", () => ({
  detectAvailableProvider: vi.fn(() => "mock-provider"),
  getDefaultModel: vi.fn(() => "fake-model"),
  getProvider: aiMocks.getProvider,
}))

const previousStateDir = process.env["KNOWBEE_STATE_DIR"]
const tempDirs: string[] = []

afterEach(() => {
  if (previousStateDir === undefined) delete process.env["KNOWBEE_STATE_DIR"]
  else process.env["KNOWBEE_STATE_DIR"] = previousStateDir
  reloadConfig()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task intake self-name handling", () => {
  it("answers Korean main-agent self-name requests before the intake model is called", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "knowbee-intake-self-name-"))
    tempDirs.push(stateDir)
    process.env["KNOWBEE_STATE_DIR"] = stateDir
    writeFileSync(join(stateDir, "config.json5"), `
      {
        profile: { language: "ko" },
        orchestration: {
          knowbee: {
            displayName: "Knowbee",
            nickname: "Knowbee"
          }
        }
      }
    `, "utf-8")
    reloadConfig()

    const { analyzeTaskIntake } = await import("../packages/core/src/agent/intake.ts")

    const result = await analyzeTaskIntake({
      userMessage: "니 이름을 말해봐",
      model: "fake-model",
      source: "telegram",
      workDir: process.cwd(),
    })

    expect(aiMocks.getProvider).not.toHaveBeenCalled()
    expect(result?.intent.category).toBe("direct_answer")
    expect(result?.user_message.mode).toBe("direct_answer")
    expect(result?.user_message.text).toBe("제 이름은 노비입니다.")
    expect(result?.notes).toContain("deterministic-main-agent-self-name")
  })
})
