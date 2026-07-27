import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createSqliteAgentIdentityCommandRepository } from "../packages/core/src/agents/agent-identity-command-repository.js"
import { executeAgentIdentityCommand } from "../packages/core/src/agents/agent-identity-command.js"
import { closeDb, getDb } from "../packages/core/src/db/index.js"
import {
  type TestRuntimeConfigFixture,
  createTestRuntimeConfigFixture,
} from "./fixtures/runtime-config.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.js"

const roots: string[] = []
let fixture: TestRuntimeConfigFixture
const envelope = (nonce: string, mutationId = nonce) => ({
  mutationId,
  nonce,
  actorRef: "webui",
  scope: "agent_identity" as const,
})

beforeEach(() => {
  closeDb()
  const root = mkdtempSync(join(tmpdir(), "knowbee-task038-identity-"))
  roots.push(root)
  fixture = createTestRuntimeConfigFixture({ rootDir: root })
  initializeTestDbRuntime(fixture.paths.stateDir)
})

afterEach(() => {
  closeDb()
  while (roots.length) {
    const root = roots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

function activeIdentity(receipt: ReturnType<typeof executeAgentIdentityCommand>): {
  agentRef: string
  revision: number
} {
  if (receipt.state !== "active" || !receipt.agentRef || receipt.revision === undefined)
    throw new Error("expected_active_agent_identity_receipt")
  return { agentRef: receipt.agentRef, revision: receipt.revision }
}

describe("Task 038 agent identity persistence", () => {
  it("migrates the durable receipt store and replays an identical result", () => {
    const tables = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>
    expect(tables.map((row) => row.name)).toContain("agent_identity_mutation_receipts")

    const repository = createSqliteAgentIdentityCommandRepository({
      config: fixture.config,
      now: () => 1_800_000_000_000,
      createId: () => "private-created-id",
    })
    const command = {
      kind: "create" as const,
      envelope: envelope("create-1"),
      name: "Writer",
      role: "Drafts",
    }
    const first = executeAgentIdentityCommand(command, repository)
    const replayed = executeAgentIdentityCommand(
      command,
      createSqliteAgentIdentityCommandRepository({ config: fixture.config }),
    )
    expect(replayed).toEqual(first)
    expect(JSON.stringify(replayed)).not.toContain("private-created-id")
  })

  it("persists name and role with compare-and-write and rejects a stale retry", () => {
    const repository = createSqliteAgentIdentityCommandRepository({
      config: fixture.config,
      now: () => 1_800_000_000_000,
      createId: () => "private-update-id",
    })
    const created = executeAgentIdentityCommand(
      { kind: "create", envelope: envelope("create-2"), name: "Researcher", role: "Research" },
      repository,
    )
    const identity = activeIdentity(created)
    const updated = executeAgentIdentityCommand(
      {
        kind: "update",
        envelope: envelope("update-1"),
        agentRef: identity.agentRef,
        baseRevision: identity.revision,
        name: "Evidence Lead",
        role: "Verification",
      },
      repository,
    )
    expect(updated).toMatchObject({
      state: "active",
      name: "Evidence Lead",
      role: "Verification",
      revision: 2,
    })
    const stale = executeAgentIdentityCommand(
      {
        kind: "update",
        envelope: envelope("update-stale"),
        agentRef: identity.agentRef,
        baseRevision: 1,
        name: "Overwrite",
        role: "Wrong",
      },
      repository,
    )
    expect(stale).toMatchObject({
      state: "conflict",
      reasonCode: "agent_revision_conflict",
      name: "Evidence Lead",
      revision: 2,
    })
  })

  it("archives only after confirmation and increments the persisted revision", () => {
    const repository = createSqliteAgentIdentityCommandRepository({
      config: fixture.config,
      now: () => 1_800_000_000_000,
      createId: () => "private-archive-id",
    })
    const created = executeAgentIdentityCommand(
      { kind: "create", envelope: envelope("create-3"), name: "Archivist", role: "Archive" },
      repository,
    )
    const identity = activeIdentity(created)
    const archived = executeAgentIdentityCommand(
      {
        kind: "archive",
        envelope: envelope("archive-1"),
        agentRef: identity.agentRef,
        baseRevision: 1,
        confirmed: true,
      },
      repository,
    )
    expect(archived).toMatchObject({ state: "active", revision: 2 })
    expect(repository.recordByRef(identity.agentRef)?.status).toBe("archived")
  })
})
