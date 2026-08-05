import { describe, expect, it } from "vitest"
import { projectCapabilitySelectionCatalog } from "../packages/core/src/runs/capability-selection-catalog.ts"

describe("capability selection catalog projection", () => {
  it("projects stored Skill definitions and owner bindings into immutable selection inputs", () => {
    const result = projectCapabilitySelectionCatalog({
      ownerAgentId: "agent:main",
      catalogEntries: [
        {
          skillId: "skill:web-research",
          status: "enabled",
          risk: "safe",
          toolNamesJson: '["web_search","web_fetch","web_search"]',
        },
        {
          skillId: "skill:computer",
          status: "disabled",
          risk: "moderate",
          toolNamesJson: '["screen_capture"]',
        },
      ],
      bindings: [
        {
          agentId: "agent:main",
          catalogId: "skill:web-research",
          status: "enabled",
          enabledToolNamesJson: '["web_search","web_fetch"]',
          disabledToolNamesJson: '["web_fetch"]',
        },
        {
          agentId: "agent:main",
          catalogId: "skill:computer",
          status: "disabled",
        },
        {
          agentId: "agent:child",
          catalogId: "skill:web-research",
          status: "enabled",
        },
      ],
    })

    expect(result).toEqual({
      ok: true,
      skillDefinitions: [
        {
          capabilityId: "skill:computer",
          toolNames: ["screen_capture"],
        },
        {
          capabilityId: "skill:web-research",
          toolNames: ["web_fetch", "web_search"],
        },
      ],
      skillBindings: [
        {
          capabilityId: "skill:computer",
          targetId: "agent:main",
          status: "disabled",
          risk: "approval_required",
          sourceSupported: false,
          toolNames: ["screen_capture"],
        },
        {
          capabilityId: "skill:web-research",
          targetId: "agent:main",
          status: "enabled",
          risk: "safe",
          sourceSupported: true,
          toolNames: ["web_search"],
        },
      ],
      instructionSkills: [],
      findings: [],
    })
  })

  it("treats persisted JSON null Tool scopes as unspecified legacy values", () => {
    expect(
      projectCapabilitySelectionCatalog({
        ownerAgentId: "agent:main",
        catalogEntries: [
          {
            skillId: "skill:web-research",
            status: "enabled",
            risk: "safe",
            toolNamesJson: '["web_search","web_fetch"]',
          },
        ],
        bindings: [
          {
            agentId: "agent:main",
            catalogId: "skill:web-research",
            status: "enabled",
            enabledToolNamesJson: '["web_search","web_fetch"]',
            disabledToolNamesJson: "null",
          },
        ],
      }),
    ).toMatchObject({
      ok: true,
      skillDefinitions: [
        {
          capabilityId: "skill:web-research",
          toolNames: ["web_fetch", "web_search"],
        },
      ],
      skillBindings: [
        {
          capabilityId: "skill:web-research",
          sourceSupported: true,
          toolNames: ["web_fetch", "web_search"],
        },
      ],
      findings: [],
    })
  })

  it("does not let an unrelated local instruction Skill block the owner's valid Tool bundle", () => {
    expect(
      projectCapabilitySelectionCatalog({
        ownerAgentId: "agent:main",
        catalogEntries: [
          {
            skillId: "skill:local-ui-guidance",
            status: "enabled",
            risk: "safe",
            toolNamesJson: "null",
            metadataJson: JSON.stringify({
              sourceKind: "local",
              canonicalPath: "/skills/ui-ux-pro-max/SKILL.md",
            }),
          },
          {
            skillId: "skill:web-research",
            status: "enabled",
            risk: "safe",
            toolNamesJson: '["web_search","web_fetch"]',
          },
        ],
        bindings: [
          {
            agentId: "agent:child",
            catalogId: "skill:local-ui-guidance",
            status: "enabled",
          },
          {
            agentId: "agent:main",
            catalogId: "skill:web-research",
            status: "enabled",
          },
        ],
      }),
    ).toEqual({
      ok: true,
      skillDefinitions: [
        {
          capabilityId: "skill:web-research",
          toolNames: ["web_fetch", "web_search"],
        },
      ],
      skillBindings: [
        {
          capabilityId: "skill:web-research",
          targetId: "agent:main",
          status: "enabled",
          risk: "safe",
          sourceSupported: true,
          toolNames: ["web_fetch", "web_search"],
        },
      ],
      instructionSkills: [],
      findings: [],
    })
  })

  it("projects an owner-bound local SKILL.md as an instruction Skill without Tool names", () => {
    expect(
      projectCapabilitySelectionCatalog({
        ownerAgentId: "agent:main",
        catalogEntries: [
          {
            skillId: "skill:local-ui-guidance",
            status: "enabled",
            risk: "safe",
            toolNamesJson: "[]",
            metadataJson: JSON.stringify({
              sourceKind: "local",
              canonicalPath: "/skills/ui-ux-pro-max/SKILL.md",
            }),
          },
        ],
        bindings: [
          {
            agentId: "agent:main",
            catalogId: "skill:local-ui-guidance",
            status: "enabled",
          },
        ],
      }),
    ).toEqual({
      ok: true,
      skillDefinitions: [],
      skillBindings: [],
      instructionSkills: [
        {
          capabilityId: "skill:local-ui-guidance",
          targetId: "agent:main",
          status: "enabled",
          risk: "safe",
          sourceRef: "/skills/ui-ux-pro-max/SKILL.md",
        },
      ],
      findings: [],
    })
  })

  it("isolates an owner-bound malformed entry and preserves valid Tool bundles", () => {
    expect(
      projectCapabilitySelectionCatalog({
        ownerAgentId: "agent:main",
        catalogEntries: [
          {
            skillId: "skill:broken",
            status: "enabled",
            risk: "safe",
            toolNamesJson: "not-json",
          },
          {
            skillId: "skill:web-research",
            status: "enabled",
            risk: "safe",
            toolNamesJson: '["web_search"]',
          },
        ],
        bindings: [
          {
            agentId: "agent:main",
            catalogId: "skill:broken",
            status: "enabled",
          },
          {
            agentId: "agent:main",
            catalogId: "skill:web-research",
            status: "enabled",
          },
        ],
      }),
    ).toEqual({
      ok: true,
      skillDefinitions: [
        {
          capabilityId: "skill:web-research",
          toolNames: ["web_search"],
        },
      ],
      skillBindings: [
        {
          capabilityId: "skill:web-research",
          targetId: "agent:main",
          status: "enabled",
          risk: "safe",
          sourceSupported: true,
          toolNames: ["web_search"],
        },
      ],
      instructionSkills: [],
      findings: [
        {
          capabilityId: "skill:broken",
          reasonCode: "tool_names_invalid",
        },
      ],
    })
  })
})
