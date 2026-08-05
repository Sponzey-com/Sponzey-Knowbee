import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  createSettingsEditSession,
  transitionSettingsEditSession,
} from "../packages/webui/src/lib/settings-edit-session.ts"
import {
  SETTINGS_SECTION_OWNERSHIP,
  settingsSectionDraftMatches,
  validateSettingsSectionOwnership,
} from "../packages/webui/src/lib/settings-section-ownership.ts"

describe("task047 settings section ownership", () => {
  it("assigns one explicit owner contract to every settings section", () => {
    expect(SETTINGS_SECTION_OWNERSHIP.map((section) => section.id)).toEqual([
      "basics",
      "ai",
      "connections",
      "sub_agents",
      "automation",
      "memory",
      "permissions",
      "diagnostics",
    ])
    expect(validateSettingsSectionOwnership(SETTINGS_SECTION_OWNERSHIP)).toEqual({
      ok: true,
      issues: [],
    })
  })

  it("keeps destination sections free from settings commands", () => {
    for (const id of ["sub_agents", "automation"] as const) {
      expect(SETTINGS_SECTION_OWNERSHIP.find((section) => section.id === id)).toEqual(
        expect.objectContaining({ lifecycle: "destination_only", commandOwner: null }),
      )
    }
  })

  it("returns stable reason codes for incomplete and conflicting ownership", () => {
    const invalid = [
      ...SETTINGS_SECTION_OWNERSHIP.filter((section) => section.id !== "diagnostics"),
      { ...SETTINGS_SECTION_OWNERSHIP[0], id: "unknown" },
      { ...SETTINGS_SECTION_OWNERSHIP[1], fieldOwner: SETTINGS_SECTION_OWNERSHIP[0]?.fieldOwner },
      { ...SETTINGS_SECTION_OWNERSHIP[3], commandOwner: "setup.sub_agents.save" },
    ]
    const result = validateSettingsSectionOwnership(invalid)

    expect(result.ok).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "section_missing",
        "section_unknown",
        "field_owner_duplicate",
        "destination_command_forbidden",
      ]),
    )
  })

  it("compares only the persisted fields owned by the saved section", () => {
    const expected = {
      personal: { profileName: "User" },
      mainAgent: { name: "노비" },
      security: { approvalMode: "on-miss" },
    }
    const authoritative = {
      ...expected,
      security: { approvalMode: "always" },
    }

    expect(settingsSectionDraftMatches("basics", expected as never, authoritative as never)).toBe(
      true,
    )
    expect(
      settingsSectionDraftMatches("permissions", expected as never, authoritative as never),
    ).toBe(false)
  })

  it("accepts redacted AI credentials after save but still detects public field mismatches", () => {
    const expected = {
      aiBackends: [{
        id: "provider:openai",
        providerType: "openai",
        authMode: "chatgpt_oauth",
        defaultModel: "gpt-5.6-sol",
        credentials: { oauthAuthFilePath: "~/.codex/auth.json" },
      }],
      routingProfiles: [{ id: "default", targets: ["provider:openai"] }],
    }
    const authoritative = {
      ...expected,
      aiBackends: [{
        ...expected.aiBackends[0],
        credentials: {},
      }],
    }

    expect(
      settingsSectionDraftMatches("ai", expected as never, authoritative as never),
    ).toBe(true)
    expect(
      settingsSectionDraftMatches(
        "ai",
        expected as never,
        {
          ...authoritative,
          aiBackends: [{
            ...authoritative.aiBackends[0],
            defaultModel: "gpt-5.4",
          }],
        } as never,
      ),
    ).toBe(false)
  })
})

describe("task047 settings edit session", () => {
  it("requires confirmation before leaving a dirty settings section", () => {
    const dirty = transitionSettingsEditSession(createSettingsEditSession(), { type: "EDIT" })
    const requested = transitionSettingsEditSession(dirty.session, {
      type: "NAVIGATE_REQUESTED",
      destination: "/chat",
    })

    expect(requested).toEqual({
      session: { status: "confirming", pendingDestination: "/chat" },
      effect: "confirm_navigation",
    })
    expect(transitionSettingsEditSession(requested.session, { type: "STAY" })).toEqual({
      session: { status: "dirty", pendingDestination: null },
      effect: "none",
    })
  })

  it("does not mark a successful save clean before authoritative reload", () => {
    const dirty = transitionSettingsEditSession(createSettingsEditSession(), { type: "EDIT" })
    const saving = transitionSettingsEditSession(dirty.session, { type: "SAVE_REQUESTED" })
    const acknowledged = transitionSettingsEditSession(saving.session, { type: "SAVE_SUCCEEDED" })

    expect(acknowledged.session.status).toBe("saving")
    expect(
      transitionSettingsEditSession(acknowledged.session, {
        type: "AUTHORITATIVE_RELOADED",
        matchesDraft: true,
      }).session.status,
    ).toBe("clean")
    expect(
      transitionSettingsEditSession(acknowledged.session, {
        type: "AUTHORITATIVE_RELOADED",
        matchesDraft: false,
      }).session.status,
    ).toBe("save_failed")
  })

  it("preserves a failed draft for retry and emits navigation only after discard", () => {
    const dirty = transitionSettingsEditSession(createSettingsEditSession(), { type: "EDIT" })
    const saving = transitionSettingsEditSession(dirty.session, { type: "SAVE_REQUESTED" })
    const failed = transitionSettingsEditSession(saving.session, { type: "SAVE_FAILED" })
    const retry = transitionSettingsEditSession(failed.session, { type: "SAVE_REQUESTED" })
    expect(failed.session.status).toBe("save_failed")
    expect(retry.session.status).toBe("saving")

    const confirming = transitionSettingsEditSession(failed.session, {
      type: "NAVIGATE_REQUESTED",
      destination: "/agents",
    })
    expect(
      transitionSettingsEditSession(confirming.session, {
        type: "DISCARD_AND_LEAVE",
      }),
    ).toEqual({
      session: { status: "discarded", pendingDestination: "/agents" },
      effect: "navigate",
    })
  })

  it("ignores illegal transitions without inventing flags", () => {
    expect(
      transitionSettingsEditSession(createSettingsEditSession(), {
        type: "SAVE_REQUESTED",
      }),
    ).toEqual({
      session: createSettingsEditSession(),
      effect: "none",
    })
  })

  it("keeps router, browser, API, and environment out of the pure state machine", () => {
    const source = readFileSync("packages/webui/src/lib/settings-edit-session.ts", "utf8")
    expect(source).not.toMatch(/react|router|window|fetch|api\.|process\.env/u)
  })

  it("uses the persisted save acknowledgement instead of reloading the unchanged runtime snapshot", () => {
    const guardSource = readFileSync(
      "packages/webui/src/components/settings/SettingsNavigationGuard.tsx",
      "utf8",
    )
    const setupSource = readFileSync("packages/webui/src/pages/SetupPage.tsx", "utf8")
    const saveCompletionSource = setupSource.slice(
      setupSource.indexOf("async function completeSettingsSave"),
      setupSource.indexOf("function recoverSettingsSave"),
    )
    expect(guardSource).toContain('window.addEventListener("beforeunload"')
    expect(guardSource).toContain('window.addEventListener("popstate"')
    expect(guardSource).toContain('role="alertdialog"')
    expect(saveCompletionSource).toContain(
      "const acknowledgedDraft = useSetupStore.getState().draft",
    )
    expect(saveCompletionSource).toContain("settingsSectionDraftMatches(")
    expect(saveCompletionSource).not.toContain("await initialize(true)")
    expect(setupSource).toContain('if (mode !== "settings") return')
  })
})
