import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import { validateSetupStep } from "../packages/webui/src/lib/setupFlow.ts"
import { translateDisplayText } from "../packages/webui/src/lib/ui-i18n.ts"

function source(path: string): string {
  return readFileSync(path, "utf8")
}

function draft(): SetupDraft {
  return {
    personal: {
      profileName: "dongwoo",
      displayName: "Dongwoo",
      language: "ko",
      timezone: "Asia/Seoul",
      workspace: "/Users/dongwoo",
    },
    aiBackends: [],
    routingProfiles: [],
    mcp: { servers: [] },
    skills: {
      items: [
        {
          id: "skill:empty",
          label: "",
          description: "",
          source: "local",
          path: "",
          enabled: true,
          required: true,
          status: "disabled",
        },
      ],
    },
    security: {
      approvalMode: "on-miss",
      approvalTimeout: 60,
      approvalTimeoutFallback: "deny",
      maxDelegationTurns: 5,
    },
    channels: {
      telegramEnabled: false,
      botToken: "",
      allowedUserIds: "",
      allowedGroupIds: "",
      slackEnabled: false,
      slackBotToken: "",
      slackAppToken: "",
      slackAllowedUserIds: "",
      slackAllowedChannelIds: "",
    },
    mqtt: {
      enabled: false,
      host: "",
      port: 1883,
      username: "",
      password: "",
      topicPrefix: "knowbee",
    },
    remoteAccess: {
      webUiAuthEnabled: false,
      webUiUsername: "",
      webUiPassword: "",
      bindHost: "127.0.0.1",
      allowedOrigins: "",
      publicBaseUrl: "",
    },
  }
}

describe("task0465 setup work ability wording", () => {
  it("uses work ability wording in setup skill validation errors", () => {
    const validation = validateSetupStep("skills", draft())

    expect(validation.skillErrors["skill:empty"]?.label).toBe("작업 능력 이름을 입력해야 합니다.")
    expect(validation.skillErrors["skill:empty"]?.path).toBe("로컬 작업 능력 경로를 입력해야 합니다.")
    expect(validation.summary).toContain("'새 작업 능력' 설정을 다시 확인해야 합니다.")
    expect(JSON.stringify(validation)).not.toContain("Skill")
  })

  it("translates work ability path messages without old Skill wording", () => {
    expect(translateDisplayText("en", "작업 능력 경로를 입력해야 합니다.")).toBe("Enter a work ability path.")
    expect(translateDisplayText("en", "작업 능력 폴더를 확인했습니다.")).toBe("Work ability folder verified.")
    expect(translateDisplayText("en", "작업 능력 파일을 확인했습니다.")).toBe("Work ability file verified.")
  })

  it("does not keep old Skill user-facing strings in setup metadata, scenes, flow, or i18n", () => {
    const combined = [
      source("packages/webui/src/lib/setup-step-meta.ts"),
      source("packages/webui/src/lib/setupFlow.ts"),
      source("packages/webui/src/lib/ui-i18n.ts"),
    ].join("\n")

    expect(combined).not.toContain("작업 능력 확장 (Skill)")
    expect(combined).not.toContain("Skill Capability Map")
    expect(combined).not.toContain("등록한 Skill")
    expect(combined).not.toContain("기본 Skill")
    expect(combined).not.toContain("로컬 Skill")
    expect(combined).not.toContain("준비된 Skill")
    expect(combined).not.toContain("필수 Skill")
    expect(combined).not.toContain("Skill 이름")
    expect(combined).not.toContain("새 Skill")
    expect(combined).not.toContain("Skill 경로")
    expect(combined).not.toContain("Skill folder")
    expect(combined).not.toContain("Skill file")
  })
})
