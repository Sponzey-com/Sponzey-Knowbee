import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { OwnerScope } from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import { closeDb, getDb } from "../packages/core/src/db/index.js"
import {
  MemoryIsolationError,
  assertMemoryAccessAllowed,
  createDataExchangePackage,
  resolveMemoryOwnerScopePolicy,
  searchOwnerScopedMemory,
  storeOwnerScopedMemory,
} from "../packages/core/src/memory/isolation.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
const now = Date.UTC(2026, 6, 13, 0, 0, 0)

function owner(ownerType: OwnerScope["ownerType"], ownerId: string): OwnerScope {
  return { ownerType, ownerId }
}

function longTermGate(targetOwner: OwnerScope, evidence: string) {
  return {
    targetOwner,
    category: "approved_work_context" as const,
    storageNeed: "durable_user_fact" as const,
    sensitivity: "not_sensitive" as const,
    userIntent: "explicit_user_request" as const,
    sourceEvidenceRefs: [evidence],
    retentionPurpose: "task1203 owner-isolation contract",
  }
}

beforeEach(() => {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task1203-memory-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task1203 agent memory isolation contract", () => {
  it("keeps main and sub-agent short-term and long-term records in independent owner scopes, including multiple sub-agents", async () => {
    const main = owner("knowbee", "agent:main")
    const researcher = owner("sub_agent", "agent:researcher")
    const reviewer = owner("sub_agent", "agent:reviewer")

    for (const [memoryOwner, label] of [
      [main, "MAIN"],
      [researcher, "RESEARCHER"],
      [reviewer, "REVIEWER"],
    ] as const) {
      await storeOwnerScopedMemory({
        owner: memoryOwner,
        visibility: "private",
        retentionPolicy: "short_term",
        rawText: `TASK1203_${label}_SHORT`,
        sourceType: "test",
      })
      await storeOwnerScopedMemory({
        owner: memoryOwner,
        visibility: "private",
        retentionPolicy: "long_term",
        longTermWriteGate: longTermGate(memoryOwner, `test:task1203:${label.toLowerCase()}`),
        rawText: `TASK1203_${label}_LONG`,
        sourceType: "test",
      })
    }

    const rows = getDb()
      .prepare<[], { owner_id: string; scope: string; metadata_json: string }>(
        `SELECT owner_id, scope, metadata_json
         FROM memory_documents
         WHERE raw_text LIKE 'TASK1203_%'
         ORDER BY owner_id, scope`,
      )
      .all()

    expect(rows.map((row) => ({ ownerId: row.owner_id, scope: row.scope }))).toEqual([
      { ownerId: "agent:main", scope: "long-term" },
      { ownerId: "agent:main", scope: "short-term" },
      { ownerId: "agent:researcher", scope: "long-term" },
      { ownerId: "agent:researcher", scope: "short-term" },
      { ownerId: "agent:reviewer", scope: "long-term" },
      { ownerId: "agent:reviewer", scope: "short-term" },
    ])
    expect(rows.map((row) => JSON.parse(row.metadata_json))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ownerScopeKey: "knowbee:agent:main", memoryIsolation: "owner_scoped" }),
        expect.objectContaining({ ownerScopeKey: "sub_agent:agent:researcher", memoryIsolation: "owner_scoped" }),
        expect.objectContaining({ ownerScopeKey: "sub_agent:agent:reviewer", memoryIsolation: "owner_scoped" }),
      ]),
    )

    const mainOwn = await searchOwnerScopedMemory({ requester: main, owner: main, query: "TASK1203_MAIN" })
    const researcherOwn = await searchOwnerScopedMemory({
      requester: researcher,
      owner: researcher,
      query: "TASK1203_RESEARCHER",
    })
    const reviewerOwn = await searchOwnerScopedMemory({
      requester: reviewer,
      owner: reviewer,
      query: "TASK1203_REVIEWER",
    })
    expect(mainOwn.memoryResults).toHaveLength(2)
    expect(researcherOwn.memoryResults).toHaveLength(2)
    expect(reviewerOwn.memoryResults).toHaveLength(2)
  })

  it("rejects direct main-to-sub, sub-to-main, and sibling memory access", async () => {
    const main = owner("knowbee", "agent:main")
    const researcher = owner("sub_agent", "agent:researcher")
    const reviewer = owner("sub_agent", "agent:reviewer")

    for (const [requester, memoryOwner] of [
      [main, researcher],
      [researcher, main],
      [reviewer, researcher],
    ] as const) {
      await expect(searchOwnerScopedMemory({ requester, owner: memoryOwner, query: "private" }))
        .rejects.toMatchObject({ reasonCode: "cross_agent_memory_requires_data_exchange" })
    }

    expect(resolveMemoryOwnerScopePolicy(owner("sub_agent", " "))).toMatchObject({
      directReadAllowed: false,
      writeAllowed: false,
      reasonCode: "memory_owner_scope_missing",
    })
  })

  it("allows only a valid exchange bound to the exact source, recipient, use, and lifetime", () => {
    const main = owner("knowbee", "agent:main")
    const researcher = owner("sub_agent", "agent:researcher")
    const reviewer = owner("sub_agent", "agent:reviewer")
    const valid = createDataExchangePackage({
      sourceOwner: main,
      recipientOwner: researcher,
      sourceAgentName: "Main",
      recipientAgentName: "Researcher",
      purpose: "Share the minimum context required for one delegated task.",
      allowedUse: "temporary_context",
      retentionPolicy: "session_only",
      redactionState: "not_sensitive",
      provenanceRefs: ["memory:task1203:main"],
      payload: { summary: "bounded context" },
      exchangeId: "exchange:task1203:valid",
      idempotencyKey: "exchange:task1203:valid",
      expiresAt: now + 60_000,
      now: () => now,
    })

    expect(assertMemoryAccessAllowed({ requester: researcher, owner: main, exchanges: [valid], now }))
      .toBe("recipient_via_exchange")

    const invalidExchanges = [
      { ...valid, recipientOwner: reviewer },
      { ...valid, sourceOwner: reviewer },
      { ...valid, allowedUse: "long_term_memory" as const },
      { ...valid, redactionState: "blocked" as const },
      { ...valid, expiresAt: now - 1 },
      { ...valid, provenanceRefs: [] },
    ]
    for (const exchange of invalidExchanges) {
      expect(() => assertMemoryAccessAllowed({
        requester: researcher,
        owner: main,
        exchanges: [exchange],
        now,
      })).toThrowError(MemoryIsolationError)
    }
  })
})
