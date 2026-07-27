import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { closeDb, getDb } from "../packages/core/src/db/index.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"
import type { OwnerScope } from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import { validateLongTermMemoryWriteGate } from "../packages/core/src/memory/long-term-write-gate.ts"
import { storeMemoryDocument } from "../packages/core/src/memory/store.ts"

const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task0314-memory-store-gate-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
}

function restoreState(): void {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
}

function owner(ownerType: OwnerScope["ownerType"], ownerId: string): OwnerScope {
  return { ownerType, ownerId }
}

function longTermGate(targetOwner: OwnerScope, evidence = "test:task0314") {
  return {
    targetOwner,
    category: "approved_work_context" as const,
    storageNeed: "durable_user_fact" as const,
    sensitivity: "not_sensitive" as const,
    userIntent: "trusted_setting" as const,
    sourceEvidenceRefs: [evidence],
    retentionPurpose: "low-level long-term store gate regression fixture",
  }
}

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  restoreState()
})

describe("task0314 low-level long-term memory store gate", () => {
  it("rejects long-term memory documents without an explicit write gate", async () => {
    await expect(storeMemoryDocument({
      rawText: "TASK0314_GATE_MISSING",
      scope: "long-term",
      ownerId: "agent:knowbee",
      sourceType: "test",
    })).rejects.toThrow(/long-term memory write gate failed/)
  })

  it("stores approved long-term memory and writes non-spoofable gate metadata", async () => {
    const knowbee = owner("knowbee", "agent:knowbee")
    const stored = await storeMemoryDocument({
      rawText: "TASK0314_GATE_APPROVED",
      scope: "long-term",
      ownerId: knowbee.ownerId,
      sourceType: "test",
      longTermWriteGate: longTermGate(knowbee, "test:task0314:approved"),
      metadata: {
        longTermWriteGate: "spoofed",
        source: "fixture",
      },
    })

    const row = getDb()
      .prepare<[string], { owner_id: string; metadata_json: string | null }>(
        "SELECT owner_id, metadata_json FROM memory_documents WHERE id = ?",
      )
      .get(stored.documentId)

    expect(row?.owner_id).toBe("agent:knowbee")
    expect(JSON.parse(row?.metadata_json ?? "{}")).toMatchObject({
      source: "fixture",
      longTermWriteGate: "approved",
      longTermWriteGateCategory: "approved_work_context",
      longTermWriteGateTargetOwnerScopeKey: "knowbee:agent:knowbee",
      longTermWriteGateStorageNeed: "durable_user_fact",
      longTermWriteGateSensitivity: "not_sensitive",
      longTermWriteGateUserIntent: "trusted_setting",
      longTermWriteGateSourceEvidenceRefs: ["test:task0314:approved"],
      longTermWriteGateRetentionPurpose: "low-level long-term store gate regression fixture",
    })
  })

  it("rejects non-agent target owners for long-term memory", async () => {
    const systemOwner = owner("system", "system:memory")
    const teamOwner = owner("team", "team:research")

    expect(validateLongTermMemoryWriteGate(longTermGate(systemOwner)).issueCodes).toContain(
      "target_owner_not_writable",
    )
    expect(validateLongTermMemoryWriteGate(longTermGate(teamOwner)).issueCodes).toContain(
      "target_owner_not_writable",
    )

    await expect(storeMemoryDocument({
      rawText: "TASK0314_GATE_SYSTEM_OWNER",
      scope: "long-term",
      ownerId: systemOwner.ownerId,
      sourceType: "test",
      longTermWriteGate: longTermGate(systemOwner, "test:task0314:system-owner"),
    })).rejects.toThrow(/target_owner_not_writable/)
  })

  it("rejects owner mismatch, secret sensitivity, and missing evidence before writing", async () => {
    const knowbee = owner("knowbee", "agent:knowbee")
    const other = owner("knowbee", "agent:other")

    await expect(storeMemoryDocument({
      rawText: "TASK0314_GATE_OWNER_MISMATCH",
      scope: "long-term",
      ownerId: knowbee.ownerId,
      sourceType: "test",
      longTermWriteGate: longTermGate(other, "test:task0314:mismatch"),
    })).rejects.toThrow(/target_owner_mismatch/)

    await expect(storeMemoryDocument({
      rawText: "TASK0314_GATE_SECRET",
      scope: "long-term",
      ownerId: knowbee.ownerId,
      sourceType: "test",
      longTermWriteGate: {
        ...longTermGate(knowbee, "test:task0314:secret"),
        sensitivity: "secret",
      },
    })).rejects.toThrow(/sensitivity_blocked/)

    await expect(storeMemoryDocument({
      rawText: "TASK0314_GATE_NO_EVIDENCE",
      scope: "long-term",
      ownerId: knowbee.ownerId,
      sourceType: "test",
      longTermWriteGate: {
        ...longTermGate(knowbee),
        sourceEvidenceRefs: [],
      },
    })).rejects.toThrow(/source_evidence_missing/)
  })

  it("rejects implicit casual-chat intent before any long-term row is written", async () => {
    const knowbee = owner("knowbee", "agent:knowbee")

    await expect(storeMemoryDocument({
      rawText: "TASK0314_IMPLICIT_CASUAL_CHAT_MUST_NOT_PERSIST",
      scope: "long-term",
      ownerId: knowbee.ownerId,
      sourceType: "conversation",
      longTermWriteGate: {
        ...longTermGate(knowbee, "test:task0314:implicit-chat"),
        userIntent: "implicit_casual_chat" as never,
      },
    })).rejects.toThrow(/user_intent_invalid/)

    const persisted = getDb()
      .prepare<[string], { count: number }>(
        "SELECT COUNT(*) AS count FROM memory_documents WHERE raw_text = ?",
      )
      .get("TASK0314_IMPLICIT_CASUAL_CHAT_MUST_NOT_PERSIST")
    expect(persisted?.count).toBe(0)
  })
})
