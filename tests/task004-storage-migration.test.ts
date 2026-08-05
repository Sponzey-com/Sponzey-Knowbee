import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"
import {
  AgentNameNamespaceError,
  closeDb,
  getAgentDataExchange,
  getAgentRelationship,
  getDb,
  getRunSubSession,
  getTeamExecutionPlan,
  insertAgentDataExchange,
  insertRunSubSession,
  insertTeamExecutionPlan,
  listAgentRelationships,
  listAgentTeamMemberships,
  listAgentNameNamespaces,
  listTeamExecutionPlansForParentRun,
  upsertAgentConfig,
  upsertAgentRelationship,
  upsertTeamConfig,
} from "../packages/core/src/db/index.js"
import { verifyMigrationState } from "../packages/core/src/db/migration-safety.ts"
import { MIGRATIONS, runMigrations } from "../packages/core/src/db/migrations.ts"
import {
  CONTRACT_SCHEMA_VERSION,
  type AgentRelationship,
  type DataExchangePackage,
  type MemoryPolicy,
  type PermissionProfile,
  type RuntimeIdentity,
  type SkillMcpAllowlist,
  type SubAgentConfig,
  type SubSessionContract,
  type TeamConfig,
  type TeamExecutionPlan,
} from "../packages/core/src/index.ts"

type SqliteStatement = {
  run(...args: unknown[]): unknown
  all(...args: unknown[]): unknown[]
  get(...args: unknown[]): unknown
}

type SqliteDatabase = {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
  transaction<T extends (...args: never[]) => unknown>(fn: T): T
  close(): void
}

type BetterSqlite3Factory = new (filename: string) => SqliteDatabase

const require = createRequire(import.meta.url)
const BetterSqlite3 = require("../packages/core/node_modules/better-sqlite3") as BetterSqlite3Factory

const tempDirs: string[] = []
const now = Date.UTC(2026, 3, 24, 0, 0, 0)

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task004-storage-"))
  tempDirs.push(rootDir)
  const runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function owner(ownerId = "agent:knowbee"): RuntimeIdentity["owner"] {
  return { ownerType: "knowbee", ownerId }
}

function identity(entityType: RuntimeIdentity["entityType"], entityId: string): RuntimeIdentity {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    entityType,
    entityId,
    owner: owner(),
    idempotencyKey: `idempotency:${entityType}:${entityId}`,
    auditCorrelationId: `audit:${entityId}`,
    parent: {
      parentRunId: "run:root",
      parentRequestId: "request:root",
    },
  }
}

const allowlist: SkillMcpAllowlist = {
  enabledSkillIds: ["research"],
  enabledMcpServerIds: ["browser"],
  enabledToolNames: ["web_search"],
  disabledToolNames: ["shell_exec"],
  secretScopeId: "agent:researcher",
}

const permissionProfile: PermissionProfile = {
  profileId: "profile:safe",
  riskCeiling: "moderate",
  approvalRequiredFrom: "moderate",
  allowExternalNetwork: true,
  allowFilesystemWrite: false,
  allowShellExecution: false,
  allowScreenControl: false,
  allowedPaths: [],
}

const memoryPolicy: MemoryPolicy = {
  owner: { ownerType: "sub_agent", ownerId: "agent:researcher" },
  visibility: "private",
  readScopes: [{ ownerType: "sub_agent", ownerId: "agent:researcher" }],
  writeScope: { ownerType: "sub_agent", ownerId: "agent:researcher" },
  retentionPolicy: "long_term",
  writebackReviewRequired: true,
}

function subAgentConfig(overrides: Partial<SubAgentConfig> = {}): SubAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId: "agent:researcher",
    displayName: "Researcher",
    nickname: "Researcher",
    status: "enabled",
    role: "research worker",
    personality: "Precise and evidence first",
    specialtyTags: ["research"],
    avoidTasks: ["shell execution"],
    modelProfile: {
      providerId: "openai",
      modelId: "gpt-5.4",
      maxOutputTokens: 1200,
    },
    memoryPolicy,
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: allowlist,
      rateLimit: { maxConcurrentCalls: 2 },
    },
    delegationPolicy: {
      enabled: true,
      maxParallelSessions: 2,
    },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
    teamIds: ["team:research"],
    delegation: {
      enabled: true,
      maxParallelSessions: 2,
    },
    ...overrides,
  }
}

function teamConfig(overrides: Partial<TeamConfig> = {}): TeamConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    teamId: "team:research",
    displayName: "Research Team",
    status: "enabled",
    purpose: "Research and evidence collection",
    ownerAgentId: "agent:knowbee",
    leadAgentId: "agent:researcher",
    memberCountMin: 1,
    memberCountMax: 2,
    requiredTeamRoles: ["lead researcher"],
    requiredCapabilityTags: ["research"],
    resultPolicy: "lead_synthesis",
    conflictPolicy: "lead_decides",
    memberships: [{
      membershipId: "team:research:membership:1",
      teamId: "team:research",
      agentId: "agent:researcher",
      ownerAgentIdSnapshot: "agent:knowbee",
      teamRoles: ["lead researcher"],
      primaryRole: "lead researcher",
      required: true,
      sortOrder: 0,
      status: "active",
    }],
    memberAgentIds: ["agent:researcher"],
    roleHints: ["lead researcher"],
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function subSession(): SubSessionContract {
  return {
    identity: {
      ...identity("sub_session", "sub-session:child"),
      parent: {
        parentRunId: "run:root",
        parentRequestId: "request:root",
        parentSubSessionId: "sub-session:parent",
      },
    },
    subSessionId: "sub-session:child",
    parentSessionId: "session:root",
    parentRunId: "run:root",
    agentId: "agent:researcher",
    agentName: "Researcher",
    agentDisplayName: "Researcher",
    agentNameSnapshot: "Researcher",
    commandRequestId: "command:1",
    status: "queued",
    promptBundleId: "bundle:1",
  }
}

function applyMigrationsThrough(db: SqliteDatabase, version: number): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `)
  for (const migration of MIGRATIONS.filter((candidate) => candidate.version <= version)) {
    const apply = () => {
      migration.up(db as unknown as Parameters<typeof runMigrations>[0])
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(migration.version, now + migration.version)
    }
    if (migration.transaction === false) apply()
    else db.transaction(apply)()
  }
}

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task004 storage migration", () => {
  it("preserves canonical rows while adding approval state and receipt contracts", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-canonical-approval-v73-"))
    tempDirs.push(rootDir)
    const dbPath = join(rootDir, "legacy-v72.sqlite3")
    const legacyDb = new BetterSqlite3(dbPath)
    try {
      applyMigrationsThrough(legacyDb, 72)
      legacyDb.prepare(
        `INSERT INTO sessions
          (id, source, source_id, created_at, updated_at, summary, token_count)
         VALUES (?, ?, NULL, ?, ?, NULL, 0)`,
      ).run("session:approval-v73", "telegram", now, now)
      legacyDb.prepare(
        `INSERT INTO root_runs
          (id, session_id, title, prompt, source, status, task_profile,
           target_id, delegation_turn_count, max_delegation_turns,
           current_step_key, current_step_index, total_steps, summary,
           can_cancel, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, 5, ?, 0, 7, ?, 1, ?, ?)`,
      ).run(
        "run:approval-v73",
        "session:approval-v73",
        "approval",
        "capture",
        "telegram",
        "running",
        "standard",
        "executing",
        "executing",
        now,
        now,
      )
      legacyDb.prepare(
        `INSERT INTO canonical_work_aggregates
          (work_id, root_run_id, state, revision, transitions_json, created_at, updated_at)
         VALUES (?, ?, 'EXECUTING', 3, '[]', ?, ?)`,
      ).run("work:root:run:approval-v73", "run:approval-v73", now, now)
      legacyDb.prepare(
        `INSERT INTO canonical_work_receipts
          (receipt_id, work_id, kind, evidence_fingerprint, evidence_refs_json,
           issued_at, consumed_revision, terminal_cause_json)
         VALUES (?, ?, 'blocker', ?, '["evidence:legacy"]', ?, NULL, NULL)`,
      ).run(
        "receipt:legacy:blocker",
        "work:root:run:approval-v73",
        `sha256:${"a".repeat(64)}`,
        now,
      )

      runMigrations(legacyDb as unknown as Parameters<typeof runMigrations>[0])

      expect(legacyDb.prepare(
        "SELECT state, revision FROM canonical_work_aggregates WHERE work_id = ?",
      ).get("work:root:run:approval-v73")).toEqual({
        state: "EXECUTING",
        revision: 3,
      })
      expect(legacyDb.prepare(
        "SELECT kind FROM canonical_work_receipts WHERE receipt_id = ?",
      ).get("receipt:legacy:blocker")).toEqual({ kind: "blocker" })
      expect(() => legacyDb.prepare(
        "UPDATE canonical_work_aggregates SET state = 'AWAITING_APPROVAL' WHERE work_id = ?",
      ).run("work:root:run:approval-v73")).not.toThrow()
      expect(() => legacyDb.prepare(
        `INSERT INTO canonical_work_receipts
          (receipt_id, work_id, kind, evidence_fingerprint, evidence_refs_json,
           issued_at, consumed_revision, terminal_cause_json)
         VALUES (?, ?, 'approval', ?, '["approval:test"]', ?, NULL, NULL)`,
      ).run(
        "receipt:approval:v73",
        "work:root:run:approval-v73",
        `sha256:${"b".repeat(64)}`,
        now + 1,
      )).not.toThrow()
      expect(legacyDb.prepare(
        `SELECT COUNT(*) AS count
         FROM approved_operation_continuations`,
      ).get()).toEqual({ count: 0 })
      expect(legacyDb.prepare(
        `SELECT sql FROM sqlite_master
         WHERE type = 'table'
           AND name = 'approved_operation_continuations'`,
      ).get()).toMatchObject({
        sql: expect.stringContaining("'cancelled'"),
      })
    } finally {
      legacyDb.close()
    }
  })

  it("creates the extended schema and verification indexes on a fresh DB", () => {
    const db = getDb()
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name)
    const subSessionColumns = (db.prepare("PRAGMA table_info(run_subsessions)").all() as Array<{ name: string }>).map((row) => row.name)
    const exchangeColumns = (db.prepare("PRAGMA table_info(agent_data_exchanges)").all() as Array<{ name: string }>).map((row) => row.name)

    expect(tables).toEqual(expect.arrayContaining([
      "agent_name_namespaces",
      "agent_relationships",
      "team_execution_plans",
    ]))
    expect(subSessionColumns).toContain("parent_sub_session_id")
    expect(exchangeColumns).toEqual(expect.arrayContaining([
      "source_agent_name_snapshot",
      "recipient_agent_name_snapshot",
      "contract_json",
    ]))
    expect(subSessionColumns).not.toEqual(expect.arrayContaining(["agent_display_name", "agent_nickname"]))
    expect(exchangeColumns).not.toEqual(expect.arrayContaining([
      "source_nickname_snapshot",
      "recipient_nickname_snapshot",
    ]))
    expect(verifyMigrationState(db).ok).toBe(true)
  })

  it("migrates a version 35 schema forward without losing legacy rows and can rerun idempotently", () => {
    const legacyDb = new BetterSqlite3(":memory:")
    try {
      applyMigrationsThrough(legacyDb, 35)

      legacyDb.prepare(
        `INSERT INTO agent_configs
         (agent_id, agent_type, status, display_name, nickname, role, personality, specialty_tags_json, avoid_tasks_json,
          memory_policy_json, capability_policy_json, profile_version, config_json, schema_version, source, audit_id,
          idempotency_key, created_at, updated_at, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "agent:researcher",
        "sub_agent",
        "enabled",
        "Researcher",
        "Researcher",
        "research worker",
        "Precise",
        JSON.stringify(["research"]),
        JSON.stringify([]),
        JSON.stringify(memoryPolicy),
        JSON.stringify({
          permissionProfile,
          skillMcpAllowlist: allowlist,
          rateLimit: { maxConcurrentCalls: 2 },
        }),
        1,
        JSON.stringify(subAgentConfig()),
        CONTRACT_SCHEMA_VERSION,
        "manual",
        "audit:agent",
        "idempotency:agent",
        now,
        now,
        null,
      )

      legacyDb.prepare(
        `INSERT INTO team_configs
         (team_id, status, display_name, nickname, purpose, role_hints_json, member_agent_ids_json, profile_version,
          config_json, schema_version, source, audit_id, idempotency_key, created_at, updated_at, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "team:research",
        "enabled",
        "Research Team",
        "Research Team",
        "Research and evidence collection",
        JSON.stringify(["lead researcher"]),
        JSON.stringify(["agent:researcher"]),
        1,
        JSON.stringify(teamConfig()),
        CONTRACT_SCHEMA_VERSION,
        "manual",
        "audit:team",
        "idempotency:team",
        now,
        now,
        null,
      )

      legacyDb.prepare(
        `INSERT INTO agent_team_memberships
         (team_id, agent_id, status, role_hint, schema_version, audit_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("team:research", "agent:researcher", "active", "lead researcher", CONTRACT_SCHEMA_VERSION, "audit:team", now, now)

      legacyDb.prepare(
        `INSERT INTO run_subsessions
         (sub_session_id, parent_run_id, parent_session_id, parent_request_id, agent_id, agent_display_name, agent_nickname,
          command_request_id, status, prompt_bundle_id, contract_json, schema_version, audit_id,
          idempotency_key, created_at, updated_at, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "sub-session:legacy",
        "run:root",
        "session:root",
        "request:root",
        "agent:researcher",
        "Researcher",
        "Researcher",
        "command:legacy",
        "queued",
        "bundle:legacy",
        JSON.stringify(subSession()),
        CONTRACT_SCHEMA_VERSION,
        "audit:sub-session",
        "idempotency:sub-session:legacy",
        now,
        now,
        null,
        null,
      )

      legacyDb.prepare(
        `INSERT INTO agent_data_exchanges
         (exchange_id, source_owner_type, source_owner_id, recipient_owner_type, recipient_owner_id, purpose, allowed_use,
          retention_policy, redaction_state, provenance_refs_json, payload_json, schema_version, audit_id, idempotency_key,
          created_at, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "exchange:legacy",
        "knowbee",
        "agent:knowbee",
        "sub_agent",
        "agent:researcher",
        "legacy context",
        "verification_only",
        "session_only",
        "redacted",
        JSON.stringify(["audit:legacy"]),
        JSON.stringify({ summary: "legacy" }),
        CONTRACT_SCHEMA_VERSION,
        "audit:exchange",
        "idempotency:exchange:legacy",
        now,
        now,
        null,
      )

      runMigrations(legacyDb as unknown as Parameters<typeof runMigrations>[0])
      runMigrations(legacyDb as unknown as Parameters<typeof runMigrations>[0])

      const teamColumns = (legacyDb.prepare("PRAGMA table_info(team_configs)").all() as Array<{ name: string }>).map((row) => row.name)
      const membershipColumns = (legacyDb.prepare("PRAGMA table_info(agent_team_memberships)").all() as Array<{ name: string }>).map((row) => row.name)
      const agentRow = legacyDb.prepare("SELECT agent_name, normalized_agent_name, model_profile_json, delegation_policy_json FROM agent_configs WHERE agent_id = ?").get("agent:researcher") as {
        agent_name: string
        normalized_agent_name: string
        model_profile_json: string | null
        delegation_policy_json: string | null
      }
      const teamRow = legacyDb.prepare(
        "SELECT display_name, owner_agent_id, lead_agent_id, result_policy, conflict_policy FROM team_configs WHERE team_id = ?",
      ).get("team:research") as {
        display_name: string
        owner_agent_id: string | null
        lead_agent_id: string | null
        result_policy: string | null
        conflict_policy: string | null
      }
      const membershipRow = legacyDb.prepare(
        "SELECT membership_id, primary_role, team_roles_json, sort_order FROM agent_team_memberships WHERE team_id = ? AND agent_id = ?",
      ).get("team:research", "agent:researcher") as {
        membership_id: string
        primary_role: string
        team_roles_json: string
        sort_order: number
      }
      const subSessionRow = legacyDb.prepare(
        "SELECT parent_sub_session_id FROM run_subsessions WHERE sub_session_id = ?",
      ).get("sub-session:legacy") as { parent_sub_session_id: string | null }
      const exchangeRow = legacyDb.prepare(
        "SELECT contract_json FROM agent_data_exchanges WHERE exchange_id = ?",
      ).get("exchange:legacy") as { contract_json: string | null }
      const namespaceRows = legacyDb.prepare(
        "SELECT normalized_agent_name, entity_type, entity_id FROM agent_name_namespaces ORDER BY entity_type ASC, entity_id ASC",
      ).all() as Array<{ normalized_agent_name: string; entity_type: string; entity_id: string }>

      expect(teamColumns).toEqual(expect.arrayContaining([
        "display_name",
        "owner_agent_id",
        "lead_agent_id",
        "required_team_roles_json",
        "required_capability_tags_json",
      ]))
      expect(membershipColumns).toEqual(expect.arrayContaining([
        "membership_id",
        "owner_agent_id_snapshot",
        "team_roles_json",
        "primary_role",
        "required",
        "fallback_for_agent_id",
        "sort_order",
      ]))
      expect(agentRow).toMatchObject({ agent_name: "Researcher", normalized_agent_name: "researcher" })
      expect(agentRow.model_profile_json).toContain("gpt-5.4")
      expect(agentRow.delegation_policy_json).toContain("maxParallelSessions")
      expect(teamRow).toMatchObject({
        display_name: "Research Team",
        owner_agent_id: "agent:knowbee",
        lead_agent_id: "agent:researcher",
        result_policy: "lead_synthesis",
        conflict_policy: "lead_decides",
      })
      expect(membershipRow).toMatchObject({
        membership_id: "team:research:membership:1",
        primary_role: "lead researcher",
        sort_order: 0,
      })
      expect(JSON.parse(membershipRow.team_roles_json)).toEqual(["lead researcher"])
      expect(subSessionRow.parent_sub_session_id).toBeNull()
      expect(exchangeRow.contract_json).toBeNull()
      expect(namespaceRows).toEqual(expect.arrayContaining([
        { normalized_agent_name: "researcher", entity_type: "agent", entity_id: "agent:researcher" },
        { normalized_agent_name: "research team", entity_type: "team", entity_id: "team:research" },
      ]))
      expect((legacyDb.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version).toBe(
        MIGRATIONS[MIGRATIONS.length - 1]?.version,
      )
    } finally {
      legacyDb.close()
    }
  })

  it("enforces agent/team nickname uniqueness through the namespace table and keeps imported configs disabled", () => {
    upsertAgentConfig(subAgentConfig(), { imported: true, idempotencyKey: "import:agent:researcher", now })
    upsertTeamConfig(teamConfig({ displayName: "Research Squad" }), { imported: true, idempotencyKey: "import:team:research", now })

    const namespaces = listAgentNameNamespaces()
    expect(namespaces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        normalized_agent_name: "researcher",
        entity_type: "agent",
        entity_id: "agent:researcher",
        status: "disabled",
      }),
      expect.objectContaining({
        normalized_agent_name: "research squad",
        entity_type: "team",
        entity_id: "team:research",
        status: "disabled",
      }),
    ]))

    expect(() => upsertTeamConfig(teamConfig({ teamId: "team:conflict", displayName: "Researcher" }), { now: now + 1 })).toThrow(
      AgentNameNamespaceError,
    )
  })

  it("persists displayName as the only canonical team name", () => {
    const team = teamConfig({
      teamId: "team:display-only",
      displayName: "Display Only Team",
      memberAgentIds: [],
      memberships: [],
    })
    delete team.nickname
    delete team.normalizedNickname

    upsertTeamConfig(team, { now })

    const row = getDb()
      .prepare<[string], { display_name: string; config_json: string }>(
        "SELECT display_name, config_json FROM team_configs WHERE team_id = ?",
      )
      .get("team:display-only")
    expect(row).toBeDefined()
    if (!row) throw new Error("Expected persisted team row.")
    expect(row).toMatchObject({
      display_name: "Display Only Team",
    })
    expect(JSON.parse(row.config_json)).toEqual(
      expect.objectContaining({
        displayName: "Display Only Team",
      }),
    )
    expect(listAgentNameNamespaces()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        normalized_agent_name: "display only team",
        entity_type: "team",
        entity_id: "team:display-only",
      }),
    ]))
  })

  it("persists hierarchy, team execution plans, parent sub-session linkage, and data exchange contract snapshots", () => {
    upsertAgentConfig(subAgentConfig(), { now })
    upsertTeamConfig(teamConfig({
      memberships: [
        {
          membershipId: "team:research:membership:1",
          teamId: "team:research",
          agentId: "agent:researcher",
          ownerAgentIdSnapshot: "agent:knowbee",
          teamRoles: ["lead researcher"],
          primaryRole: "lead researcher",
          required: true,
          sortOrder: 0,
          status: "active",
        },
        {
          membershipId: "team:research:membership:2",
          teamId: "team:research",
          agentId: "agent:backup",
          ownerAgentIdSnapshot: "agent:knowbee",
          teamRoles: ["backup researcher"],
          primaryRole: "backup researcher",
          required: false,
          sortOrder: 1,
          status: "fallback_only",
        },
      ],
      memberAgentIds: ["agent:researcher", "agent:backup"],
      roleHints: ["lead researcher", "backup researcher"],
      memberCountMax: 2,
    }), { now })

    const relationship: AgentRelationship = {
      edgeId: "edge:parent-child",
      parentAgentId: "agent:knowbee",
      childAgentId: "agent:researcher",
      relationshipType: "parent_child",
      status: "active",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    }
    upsertAgentRelationship(relationship, { now })

    const session = subSession()
    expect(insertRunSubSession(session, { now })).toBe(true)
    expect(insertRunSubSession(session, { now })).toBe(false)

    const exchange: DataExchangePackage = {
      identity: identity("data_exchange", "exchange:1"),
      exchangeId: "exchange:1",
      sourceOwner: { ownerType: "knowbee", ownerId: "agent:knowbee" },
      recipientOwner: { ownerType: "sub_agent", ownerId: "agent:researcher" },
      sourceAgentNameSnapshot: "Knowbee",
      recipientAgentNameSnapshot: "Researcher",
      purpose: "verification context",
      allowedUse: "verification_only",
      retentionPolicy: "session_only",
      redactionState: "redacted",
      provenanceRefs: ["audit:source"],
      payload: { summary: "redacted context" },
      createdAt: now,
    }
    expect(insertAgentDataExchange(exchange, { expiresAt: now + 1_000 })).toBe(true)

    const teamExecutionPlan: TeamExecutionPlan = {
      teamExecutionPlanId: "team-plan:1",
      parentRunId: "run:root",
      teamId: "team:research",
      teamNameSnapshot: "Research Team",
      ownerAgentId: "agent:knowbee",
      leadAgentId: "agent:researcher",
      memberTaskAssignments: [{ agentId: "agent:researcher", taskIds: ["task:1"], role: "lead researcher" }],
      reviewerAgentIds: ["agent:reviewer"],
      verifierAgentIds: ["agent:verifier"],
      fallbackAssignments: [{ missingAgentId: "agent:backup", fallbackAgentId: "agent:researcher", reasonCode: "missing_agent" }],
      coverageReport: { coveredTasks: ["task:1"], missingAgents: ["agent:backup"] },
      conflictPolicySnapshot: "lead_decides",
      resultPolicySnapshot: "lead_synthesis",
      createdAt: now,
    }
    expect(insertTeamExecutionPlan(teamExecutionPlan)).toBe(true)

    expect(getAgentRelationship("edge:parent-child")).toMatchObject({
      parent_agent_id: "agent:knowbee",
      child_agent_id: "agent:researcher",
      status: "active",
    })
    expect(listAgentRelationships({ parentAgentId: "agent:knowbee" })).toHaveLength(1)
    expect(getRunSubSession("sub-session:child")).toMatchObject({
      parent_sub_session_id: "sub-session:parent",
      idempotency_key: "idempotency:sub_session:sub-session:child",
    })
    expect(getAgentDataExchange("exchange:1")).toMatchObject({
      source_agent_name: "Knowbee",
      source_agent_name_snapshot: "Knowbee",
      recipient_agent_name: "Researcher",
      recipient_agent_name_snapshot: "Researcher",
    })
    expect(getAgentDataExchange("exchange:1")?.contract_json).toContain("\"exchangeId\":\"exchange:1\"")
    expect(getTeamExecutionPlan("team-plan:1")).toMatchObject({
      parent_run_id: "run:root",
      team_name_snapshot: "Research Team",
    })
    expect(listTeamExecutionPlansForParentRun("run:root")).toEqual([
      expect.objectContaining({
        team_name_snapshot: "Research Team",
      }),
    ])
    expect(listAgentTeamMemberships("team:research")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        membership_id: "team:research:membership:1",
        primary_role: "lead researcher",
        status: "active",
      }),
      expect.objectContaining({
        membership_id: "team:research:membership:2",
        primary_role: "backup researcher",
        status: "unresolved",
      }),
    ]))
  })
})
