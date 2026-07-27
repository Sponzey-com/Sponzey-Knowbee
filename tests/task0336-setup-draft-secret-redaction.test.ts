import { createRequire } from "node:module"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerSettingsRoute } from "../packages/core/src/api/routes/settings.js"
import { registerSetupRoute } from "../packages/core/src/api/routes/setup.js"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import { stopMqttBroker } from "../packages/core/src/mqtt/broker.js"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{
    statusCode: number
    json(): any
  }>
}

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

const secrets = {
  aiApiKey: "sk-task0336-ai-secret-value-1234567890",
  aiPassword: "task0336-ai-password-secret",
  telegramToken: "123456:telegram-task0336-secret-token",
  slackBotToken: "xoxb-task0336-slack-bot-secret-token",
  slackAppToken: "xapp-task0336-slack-app-secret-token",
  discordToken: "discord-task0336-bot-secret-token",
  discordPublicKey: "discord-task0336-public-key-secret",
  googleCredentialJson: "{\"private_key\":\"google-task0336-private-key-secret\"}",
  googleVerificationToken: "google-task0336-verification-secret",
  kakaoBusinessApiKey: "kakao-task0336-business-api-secret",
  mqttPassword: "mqtt-task0336-password-secret",
  remoteAuthToken: "remote-task0336-auth-secret",
}

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0336-state-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({
    rootDir,
    configText: JSON.stringify(buildSecretConfig(), null, 2),
  })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function buildSecretConfig(): Record<string, unknown> {
  return {
    profile: {
      profileName: "Tester",
      displayName: "Tester",
      language: "ko",
      timezone: "Asia/Seoul",
      workspace: "/tmp/knowbee-task0336-workspace",
    },
    ai: {
      connection: {
        provider: "custom",
        model: "gpt-test",
        endpoint: "https://api.example.test/v1",
        auth: {
          mode: "api_key",
          apiKey: secrets.aiApiKey,
          username: "visible-ai-user",
          password: secrets.aiPassword,
        },
      },
    },
    telegram: {
      enabled: true,
      botToken: secrets.telegramToken,
      allowedUserIds: [42120565],
    },
    slack: {
      enabled: true,
      botToken: secrets.slackBotToken,
      appToken: secrets.slackAppToken,
    },
    discord: {
      enabled: true,
      botToken: secrets.discordToken,
      applicationId: "discord-app-id",
      publicKey: secrets.discordPublicKey,
    },
    googleChat: {
      enabled: true,
      projectId: "google-project",
      appCredentialJson: secrets.googleCredentialJson,
      serviceAccountEmail: "svc@example.test",
      webhookUrl: "https://chat.googleapis.com/v1/spaces/example/messages?key=visible-for-now",
      verificationToken: secrets.googleVerificationToken,
    },
    kakaoTalk: {
      enabled: true,
      mode: "official",
      businessApiEnabled: true,
      businessApiKey: secrets.kakaoBusinessApiKey,
      channelId: "kakao-channel",
    },
    mqtt: {
      enabled: true,
      host: "127.0.0.1",
      port: 1883,
      username: "mqtt-user",
      password: secrets.mqttPassword,
    },
    webui: {
      host: "127.0.0.1",
      port: 18888,
      auth: {
        enabled: true,
        token: secrets.remoteAuthToken,
      },
    },
  }
}

function expectNoSecrets(value: unknown): void {
  const serialized = JSON.stringify(value)
  for (const secret of Object.values(secrets)) {
    expect(serialized).not.toContain(secret)
  }
}

beforeEach(() => {
  useTempState()
})

afterEach(async () => {
  await stopMqttBroker()
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0336 setup draft secret redaction", () => {
  it("masks setup draft secrets in settings and setup GET responses", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerSettingsRoute(app)
    registerSetupRoute(app)
    await app.ready()
    try {
      const settings = await app.inject({ method: "GET", url: "/api/settings" })
      expect(settings.statusCode).toBe(200)
      expectNoSecrets(settings.json())
      expect(settings.json().draft.channels.botToken).toBe("***")
      expect(settings.json().draft.channels.slackBotToken).toBe("***")
      expect(settings.json().draft.channels.slackAppToken).toBe("***")
      expect(settings.json().draft.mqtt.password).toBe("***")
      expect(settings.json().draft.remoteAccess.authToken).toBe("***")
      expect(settings.json().draft.aiBackends.some((backend: any) => backend.credentials.apiKey === "***")).toBe(true)

      const setupDraft = await app.inject({ method: "GET", url: "/api/setup/draft" })
      expect(setupDraft.statusCode).toBe(200)
      expectNoSecrets(setupDraft.json())
      expect(setupDraft.json().channels.discordBotToken).toBe("***")
      expect(setupDraft.json().channels.googleChatAppCredentialJson).toBe("***")
      expect(setupDraft.json().channels.kakaoTalkBusinessApiKey).toBe("***")

      const nextDraft = setupDraft.json()
      nextDraft.personal.profileName = "Next Start Tester"
      nextDraft.personal.displayName = "Next Start Tester"
      const saved = await app.inject({
        method: "PUT",
        url: "/api/setup/draft",
        payload: { draft: nextDraft },
      })
      expect(saved.statusCode).toBe(200)
      expect(saved.json()).toEqual(expect.objectContaining({
        restartRequired: true,
        appliesOn: "next_start",
      }))
      expectNoSecrets(saved.json())

      const runningDraft = await app.inject({ method: "GET", url: "/api/setup/draft" })
      expect(runningDraft.json().personal.displayName).toBe("Tester")
      expect(readFileSync(runtimeFixture.paths.configFile, "utf-8")).toContain("Next Start Tester")
    } finally {
      await app.close()
    }
  })

  it("preserves existing secrets when saving a masked settings draft", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerSettingsRoute(app)
    await app.ready()
    try {
      const settings = await app.inject({ method: "GET", url: "/api/settings" })
      const draft = settings.json().draft
      draft.personal.displayName = "Updated Tester"
      draft.personal.profileName = "Updated Tester"

      const saved = await app.inject({
        method: "PUT",
        url: "/api/settings",
        payload: { draft, state: settings.json().state },
      })
      expect(saved.statusCode).toBe(200)
      expectNoSecrets(saved.json())
      expect(saved.json().draft.channels.botToken).toBe("***")

      const rawConfig = readFileSync(runtimeFixture.paths.configFile, "utf-8")
      for (const secret of Object.values(secrets)) {
        expect(rawConfig).toContain(secret)
      }
      expect(rawConfig).not.toContain("\"botToken\": \"***\"")
      expect(rawConfig).not.toContain("\"password\": \"***\"")
    } finally {
      await app.close()
    }
  })
})
