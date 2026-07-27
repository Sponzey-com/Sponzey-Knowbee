import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  rollbackPromptSourceBackup,
  writePromptSourceWithBackup,
} from "../packages/core/src/memory/knowbee-md.ts"

const tempDirs: string[] = []

function createPromptFixture(): { root: string; identityPath: string } {
  const root = mkdtempSync(join(tmpdir(), "knowbee-task0066-prompt-rollback-"))
  tempDirs.push(root)
  const promptsDir = join(root, "prompts")
  mkdirSync(promptsDir)
  const identityPath = join(promptsDir, "identity.md")
  writeFileSync(identityPath, "# Identity\n\nOriginal identity prompt\n", "utf-8")
  return { root, identityPath }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0066 prompt source rollback report", () => {
  it("returns a structured rollback report with activation state and next action", () => {
    const { root, identityPath } = createPromptFixture()
    const beforeContent = readFileSync(identityPath, "utf-8")
    const writeResult = writePromptSourceWithBackup({
      workDir: root,
      sourceId: "identity",
      locale: "en",
      content: "# Identity\n\nChanged prompt source\n",
    })

    const rollback = rollbackPromptSourceBackup({
      sourcePath: writeResult.backup!.sourcePath,
      backupPath: writeResult.backup!.backupPath,
      reason: "prompt_source_regression_failed",
    })

    expect(rollback.restoredChecksum).toBe(writeResult.diff.beforeChecksum)
    expect(rollback.previousChecksum).toBe(writeResult.diff.afterChecksum)
    expect(rollback.rolledBackFiles).toEqual([{
      sourcePath: writeResult.backup!.sourcePath,
      backupPath: writeResult.backup!.backupPath,
    }])
    expect(rollback.reason).toBe("prompt_source_regression_failed")
    expect(rollback.activationStateAfterRollback).toBe("rolled_back")
    expect(rollback.remainingRisk).toBe("Runtime may still need reload or restart before the restored prompt source is active.")
    expect(rollback.nextRecommendedAction).toBe("Run prompt regression checks and confirm runtime activation before reporting the prompt as active.")
    expect(readFileSync(identityPath, "utf-8")).toBe(beforeContent)
  })
})
