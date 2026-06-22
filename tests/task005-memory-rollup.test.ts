import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { reloadConfig } from "../packages/core/src/config/index.js"
import {
  closeDb,
  getMemoryCapsule,
  insertMemoryCapsule,
  listMemoryCapsuleRollups,
} from "../packages/core/src/db/index.js"
import type { MemoryCapsule } from "../packages/core/src/memory/capsule.ts"
import {
  buildMaintenanceRestoreContext,
  maybeRollupCapsuleChain,
  renderMaintenanceRestorePromptBlock,
} from "../packages/core/src/memory/retrieval-restore.ts"
import { closeMemoryJournalDb } from "../packages/core/src/memory/journal.js"

const previousStateDir = process.env["KNOWBEE_STATE_DIR"]
const previousConfig = process.env["KNOWBEE_CONFIG"]
const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  closeMemoryJournalDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task005-rollup-"))
  tempDirs.push(stateDir)
  process.env["KNOWBEE_STATE_DIR"] = stateDir
  delete process.env["KNOWBEE_CONFIG"]
  reloadConfig()
}

function baseCapsule(index: number): MemoryCapsule {
  return {
    capsuleId: `capsule-rollup-${index}`,
    capsuleVersion: 1,
    ownerScope: {
      ownerType: "main_agent",
      ownerId: "agent:knowbee",
      sessionId: "session-rollup",
      requestGroupId: "group-rollup",
      lineageId: "group-rollup",
      channelKey: "webui",
      threadKey: "thread-rollup",
    },
    nicknameSnapshot: "노우비",
    capsuleKind: "session_compaction",
    summary: `capsule summary ${index}`,
    activeObjectives: [`objective-${index}`],
    confirmedFacts: [`fact-${index}`],
    decisions: [`decision-${index}`],
    constraints: [`constraint-${index}`],
    pendingItems: [`pending_approval:approval-${index}`],
    artifactRefs: [{ note: `artifact://rollup-${index}` }],
    recoveryHints: [`hint-${index}`],
    sourceRefs: [`message:${index}`],
    compactedMessageIds: [`msg-${index}`],
    sourceTokenEstimate: 1800 + index,
    resultTokenEstimate: 700 + index,
    createdAt: 100 + index,
  }
}

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  closeDb()
  closeMemoryJournalDb()
  if (previousStateDir === undefined) delete process.env["KNOWBEE_STATE_DIR"]
  else process.env["KNOWBEE_STATE_DIR"] = previousStateDir
  if (previousConfig === undefined) delete process.env["KNOWBEE_CONFIG"]
  else process.env["KNOWBEE_CONFIG"] = previousConfig
  reloadConfig()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task005 capsule chain rollup", () => {
  it("rolls up older capsules while keeping recent capsules bounded", () => {
    for (let index = 0; index < 5; index += 1) {
      insertMemoryCapsule(baseCapsule(index))
    }

    const rollup = maybeRollupCapsuleChain({
      ownerScope: {
        ownerType: "main_agent",
        ownerId: "agent:knowbee",
        sessionId: "session-rollup",
        requestGroupId: "group-rollup",
        lineageId: "group-rollup",
        channelKey: "webui",
        threadKey: "thread-rollup",
      },
      recentLimit: 2,
      countThreshold: 3,
      runId: "run-rollup",
      sessionId: "session-rollup",
      requestGroupId: "group-rollup",
    })

    expect(rollup.performed).toBe(true)
    expect(rollup.recentCapsules.map((capsule) => capsule.capsuleId)).toEqual([
      "capsule-rollup-4",
      "capsule-rollup-3",
    ])
    expect(rollup.rollupCapsule?.capsuleKind).toBe("lineage_compaction")
    expect(rollup.rollupCapsule?.pendingItems).toEqual([])

    const rollupAudit = listMemoryCapsuleRollups({
      ownerType: "main_agent",
      ownerId: "agent:knowbee",
      sessionId: "session-rollup",
      limit: 1,
    })[0]
    expect(rollupAudit).toEqual(expect.objectContaining({
      sourceCapsuleCount: 3,
      recentCapsuleIds: ["capsule-rollup-4", "capsule-rollup-3"],
      reasonCode: "capsule_count_threshold",
    }))
    expect(rollupAudit?.preservedPendingItems).toContain("pending_approval:approval-0")
    expect(getMemoryCapsule(rollupAudit!.resultRollupCapsuleId)?.summary).toContain("capsule summary")

    const maintenanceRestore = buildMaintenanceRestoreContext({
      ownerScope: {
        ownerType: "main_agent",
        ownerId: "agent:knowbee",
        sessionId: "session-rollup",
        requestGroupId: "group-rollup",
        lineageId: "group-rollup",
        channelKey: "webui",
        threadKey: "thread-rollup",
      },
      requestGroupId: "group-rollup",
    })
    const promptBlock = renderMaintenanceRestorePromptBlock(maintenanceRestore)
    expect(promptBlock).toContain("[recent_capsules]")
    expect(promptBlock).toContain("[rollup_capsule]")
  })
})
