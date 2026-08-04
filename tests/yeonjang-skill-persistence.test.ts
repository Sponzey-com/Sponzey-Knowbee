import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  closeDb,
  listAgentCapabilityBindings,
  listSkillCatalogEntries,
  upsertAgentCapabilityBinding,
} from "../packages/core/src/db/index.js"
import {
  registerBuiltinSkills,
  YEONJANG_SKILL_TOOL_NAMES,
} from "../packages/core/src/skills/builtin.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

describe("built-in Yeonjang skill persistence", () => {
  beforeEach(() => {
    closeDb()
    const stateDir = mkdtempSync(join(tmpdir(), "knowbee-yeonjang-skill-"))
    tempDirs.push(stateDir)
    initializeTestDbRuntime(stateDir)
  })

  afterEach(() => {
    closeDb()
    for (const directory of tempDirs.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("persists the catalog entry and an enabled binding for the configured main agent", () => {
    registerBuiltinSkills({ mainAgentId: "agent:main", now: 1000 })

    const skill = listSkillCatalogEntries().find((entry) => entry.skill_id === "skill:yeonjang")
    const binding = listAgentCapabilityBindings({ agentId: "agent:main" })
      .find((entry) => entry.catalog_id === "skill:yeonjang")

    expect(skill).toMatchObject({ status: "enabled", risk: "moderate", source: "system" })
    expect(JSON.parse(skill?.tool_names_json ?? "[]")).toEqual([...YEONJANG_SKILL_TOOL_NAMES])
    expect(binding).toMatchObject({
      binding_id: "binding:agent:main:skill:yeonjang",
      agent_id: "agent:main",
      capability_kind: "skill",
      catalog_id: "skill:yeonjang",
      status: "enabled",
      approval_required_from: "moderate",
      source: "system",
    })
  })

  it("preserves an explicit disabled binding across built-in registration", () => {
    registerBuiltinSkills({ mainAgentId: "agent:main", now: 1000 })
    upsertAgentCapabilityBinding({
      bindingId: "binding:agent:main:skill:yeonjang",
      agentId: "agent:main",
      capabilityKind: "skill",
      catalogId: "skill:yeonjang",
      status: "disabled",
      enabledToolNames: [],
      disabledToolNames: ["shell_exec"],
      updatedAt: 1500,
    }, { source: "manual", now: 1500 })

    registerBuiltinSkills({ mainAgentId: "agent:main", now: 2000 })

    const binding = listAgentCapabilityBindings({
      agentId: "agent:main",
      includeArchived: true,
    }).find((entry) => entry.catalog_id === "skill:yeonjang")

    expect(binding).toMatchObject({
      capability_kind: "skill",
      catalog_id: "skill:yeonjang",
      status: "disabled",
      source: "manual",
      updated_at: 1500,
    })
  })

  it("keeps one Yeonjang Skill while preserving multiple independent instance bindings", () => {
    for (const instanceId of ["yeonjang:office", "yeonjang:studio"]) {
      upsertAgentCapabilityBinding({
        bindingId: `binding:agent:main:${instanceId}`,
        agentId: "agent:main",
        capabilityKind: "yeonjang",
        catalogId: instanceId,
        status: "enabled",
        enabledToolNames: ["yeonjang_status"],
        disabledToolNames: [],
        createdAt: 900,
        updatedAt: 900,
      }, { source: "manual", now: 900 })
    }

    registerBuiltinSkills({ mainAgentId: "agent:main", now: 1000 })

    expect(
      listSkillCatalogEntries({ includeArchived: true })
        .filter((entry) => entry.skill_id === "skill:yeonjang"),
    ).toHaveLength(1)
    expect(
      listAgentCapabilityBindings({
        agentId: "agent:main",
        capabilityKind: "skill",
        includeArchived: true,
      }).filter((entry) => entry.catalog_id === "skill:yeonjang"),
    ).toHaveLength(1)
    expect(
      listAgentCapabilityBindings({
        agentId: "agent:main",
        capabilityKind: "yeonjang",
        includeArchived: true,
      }).map((entry) => entry.catalog_id),
    ).toEqual(["yeonjang:office", "yeonjang:studio"])
  })
})
