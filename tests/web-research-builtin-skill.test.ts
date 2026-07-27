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
  WEB_RESEARCH_SKILL_ID,
  WEB_RESEARCH_SKILL_TOOL_NAMES,
} from "../packages/core/src/skills/builtin.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

describe("built-in web research skill persistence", () => {
  beforeEach(() => {
    closeDb()
    const stateDir = mkdtempSync(join(tmpdir(), "knowbee-web-research-skill-"))
    tempDirs.push(stateDir)
    initializeTestDbRuntime(stateDir)
  })

  afterEach(() => {
    closeDb()
    for (const directory of tempDirs.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("persists one safe catalog entry and enabled binding for only the configured main agent", () => {
    registerBuiltinSkills({ mainAgentId: "agent:custom-main", now: 1000 })
    registerBuiltinSkills({ mainAgentId: "agent:custom-main", now: 2000 })

    const skills = listSkillCatalogEntries({ includeArchived: true })
      .filter((entry) => entry.skill_id === WEB_RESEARCH_SKILL_ID)
    const bindings = listAgentCapabilityBindings({ includeArchived: true })
      .filter((entry) => entry.catalog_id === WEB_RESEARCH_SKILL_ID)

    expect(skills).toHaveLength(1)
    expect(skills[0]).toMatchObject({
      display_name: "Web research",
      status: "enabled",
      risk: "safe",
      source: "system",
    })
    expect(JSON.parse(skills[0]?.tool_names_json ?? "[]")).toEqual([
      ...WEB_RESEARCH_SKILL_TOOL_NAMES,
    ])
    expect(JSON.parse(skills[0]?.metadata_json ?? "{}")).toMatchObject({
      builtin: true,
      capability: "web_research",
    })

    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({
      binding_id: "binding:agent:custom-main:skill:web-research",
      agent_id: "agent:custom-main",
      capability_kind: "skill",
      catalog_id: WEB_RESEARCH_SKILL_ID,
      status: "enabled",
      approval_required_from: "safe",
      source: "system",
    })
    expect(JSON.parse(bindings[0]?.enabled_tool_names_json ?? "[]")).toEqual([
      ...WEB_RESEARCH_SKILL_TOOL_NAMES,
    ])
  })

  it.each(["disabled", "archived"] as const)(
    "preserves an explicit %s binding across built-in registration",
    (status) => {
      registerBuiltinSkills({ mainAgentId: "agent:main", now: 1000 })
      upsertAgentCapabilityBinding({
        bindingId: "binding:agent:main:skill:web-research",
        agentId: "agent:main",
        capabilityKind: "skill",
        catalogId: WEB_RESEARCH_SKILL_ID,
        status,
        enabledToolNames: [],
        disabledToolNames: ["web_fetch"],
        approvalRequiredFrom: "safe",
        updatedAt: 1500,
      }, { source: "manual", now: 1500 })

      registerBuiltinSkills({ mainAgentId: "agent:main", now: 2000 })

      const binding = listAgentCapabilityBindings({
        agentId: "agent:main",
        capabilityKind: "skill",
        includeArchived: true,
      }).find((entry) => entry.catalog_id === WEB_RESEARCH_SKILL_ID)
      expect(binding).toMatchObject({
        status,
        source: "manual",
        updated_at: 1500,
      })
    },
  )
})
