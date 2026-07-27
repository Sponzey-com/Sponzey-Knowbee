import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import { validateSetupStep } from "../packages/webui/src/lib/setupFlow.ts"
import { translateDisplayText } from "../packages/webui/src/lib/ui-i18n.ts"

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
    mcp: {
      servers: [
        {
          id: "mcp:empty",
          name: "",
          transport: "stdio",
          command: "",
          argsText: "",
          cwd: "",
          url: "",
          required: true,
          enabled: false,
          status: "disabled",
          tools: [],
        },
      ],
    },
    skills: { items: [] },
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

describe("task0463 setup external feature validation wording", () => {
  it("uses external feature connection wording in mcp validation errors", () => {
    const validation = validateSetupStep("mcp", draft())

    expect(validation.mcpErrors["mcp:empty"]?.status).toBe("필수 외부 기능 연결은 꺼둘 수 없습니다.")
    expect(validation.summary).toContain("'새 외부 기능 연결' 설정을 다시 확인해야 합니다.")
    expect(JSON.stringify(validation)).not.toContain("MCP 서버")
  })

  it("translates external feature connection status text without old MCP server wording", () => {
    expect(translateDisplayText("en", "외부 기능 연결이 설정되지 않았습니다.")).toBe(
      "No external feature connections are configured.",
    )
    expect(translateDisplayText("en", "필수 외부 기능 연결 2개가 준비되지 않았습니다.")).toBe(
      "2 required external feature connection(s) are not ready.",
    )
    expect(translateDisplayText("en", "외부 기능 연결 1/3개가 준비되었습니다.")).toBe(
      "1/3 external feature connection(s) are ready.",
    )
  })

  it("does not keep old MCP server validation wording in setup flow and i18n sources", () => {
    const setupFlow = readFileSync("packages/webui/src/lib/setupFlow.ts", "utf8")
    const i18n = readFileSync("packages/webui/src/lib/ui-i18n.ts", "utf8")

    expect(setupFlow).not.toContain("필수 MCP 서버")
    expect(setupFlow).not.toContain("새 MCP 서버")
    expect(i18n).not.toContain("MCP 서버가 설정되지 않았습니다.")
    expect(i18n).not.toContain("설정된 MCP 서버")
    expect(i18n).not.toContain("필수 MCP 서버")
    expect(i18n).not.toContain("MCP server(s)")
  })
})
