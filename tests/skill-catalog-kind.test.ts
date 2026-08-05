import { describe, expect, it } from "vitest"
import {
  classifySkillCatalogKind,
  projectSkillCatalogReconciliation,
} from "../packages/core/src/capabilities/skill-catalog-kind.ts"

describe("Skill catalog kind contract", () => {
  it("classifies explicit instruction and Tool bundle Skills", () => {
    expect(
      classifySkillCatalogKind({
        toolNamesJson: "[]",
        metadataJson: JSON.stringify({
          skillKind: "instruction_skill",
          sourceKind: "local",
          canonicalPath: "/skills/ui/SKILL.md",
        }),
      }),
    ).toEqual({
      ok: true,
      kind: "instruction_skill",
      resolution: "explicit",
      sourceRef: "/skills/ui/SKILL.md",
    })
    expect(
      classifySkillCatalogKind({
        toolNamesJson: '["web_fetch","web_search"]',
        metadataJson: JSON.stringify({ skillKind: "tool_bundle_skill" }),
      }),
    ).toEqual({
      ok: true,
      kind: "tool_bundle_skill",
      resolution: "explicit",
      toolNames: ["web_fetch", "web_search"],
    })
  })

  it("reports legacy inference without mutating the input rows", () => {
    const rows = Object.freeze([
      Object.freeze({
        skillId: "skill:legacy-local",
        toolNamesJson: "null",
        metadataJson: JSON.stringify({
          sourceKind: "local",
          canonicalPath: "/skills/legacy/SKILL.md",
        }),
      }),
      Object.freeze({
        skillId: "skill:legacy-web",
        toolNamesJson: '["web_search"]',
        metadataJson: null,
      }),
    ])

    expect(projectSkillCatalogReconciliation(rows)).toEqual([
      {
        skillId: "skill:legacy-local",
        status: "inferred",
        kind: "instruction_skill",
        reasonCode: "legacy_skill_kind_inferred",
      },
      {
        skillId: "skill:legacy-web",
        status: "inferred",
        kind: "tool_bundle_skill",
        reasonCode: "legacy_skill_kind_inferred",
      },
    ])
    expect(rows[0]?.toolNamesJson).toBe("null")
  })

  it("distinguishes explicit kind conflicts from malformed definitions", () => {
    expect(
      projectSkillCatalogReconciliation([
        {
          skillId: "skill:conflict",
          toolNamesJson: '["web_search"]',
          metadataJson: JSON.stringify({
            skillKind: "instruction_skill",
            sourceKind: "local",
            canonicalPath: "/skills/conflict/SKILL.md",
          }),
        },
        {
          skillId: "skill:broken",
          toolNamesJson: "not-json",
          metadataJson: null,
        },
      ]),
    ).toEqual([
      {
        skillId: "skill:conflict",
        status: "invalid",
        kind: null,
        reasonCode: "skill_kind_contract_conflict",
      },
      {
        skillId: "skill:broken",
        status: "invalid",
        kind: null,
        reasonCode: "skill_tool_names_invalid",
      },
    ])
  })
})
