import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const brokerMocks = vi.hoisted(() => ({
  getMqttBrokerSnapshot: vi.fn(),
  getMqttExtensionSnapshots: vi.fn(),
  validateMqttBrokerConfig: vi.fn(),
}))

vi.mock("../packages/core/src/mqtt/broker.js", () => brokerMocks)

const { clearYeonjangCapabilityCache, getYeonjangCapabilities } = await import(
  "../packages/core/src/yeonjang/mqtt-client.ts"
)

describe("Yeonjang MQTT v2 capability lease", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-04T07:24:00.000Z"))
    clearYeonjangCapabilityCache()
    brokerMocks.getMqttBrokerSnapshot.mockReset()
    brokerMocks.getMqttExtensionSnapshots.mockReset()
    brokerMocks.validateMqttBrokerConfig.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("uses a valid signed v2 capability projection after the legacy five-second cache window", async () => {
    const now = Date.now()
    brokerMocks.getMqttExtensionSnapshots.mockReturnValue([
      {
        extensionId: "instance-a",
        clientId: "client-a",
        displayName: "Yeonjang",
        instanceId: "instance-a",
        instanceAlias: "local-mac",
        normalizedCallName: "yeonjang-main",
        nodeId: "yeonjang-main",
        supportProfile: "desktop_interactive",
        configuredSupportProfile: null,
        supportProfileReasonCodes: [],
        interactiveDesktopAvailable: true,
        trayRuntimeAvailable: true,
        state: "online",
        message: null,
        version: "0.3.0",
        protocolVersion: "2",
        gitTag: null,
        gitCommit: null,
        buildTarget: null,
        platform: "macos",
        os: "macos",
        arch: "arm64",
        transport: ["mqtt_v2"],
        capabilityHash: "sha256:test",
        methods: ["screen.capture"],
        sessionId: "session-a",
        startupMode: null,
        windowMode: null,
        trayState: null,
        trustState: "trusted",
        workspaceScopeId: "workspace-a",
        pairingFingerprint: null,
        hostFingerprint: null,
        installFingerprint: null,
        targetFingerprint: "sha256:target",
        v2StatusSequence: 5,
        v2CapabilitiesSequence: 7,
        v2StatusExpiresAt: now + 60_000,
        v2CapabilitiesExpiresAt: now + 60_000,
        capabilityMatrix: {
          "screen.capture": { supported: true, outputModes: ["base64"] },
        },
        lastCapabilityRefreshAt: now - 10_000,
        lastSeenAt: now,
      },
    ])

    const capabilities = await getYeonjangCapabilities({ extensionId: "instance-a" })

    expect(capabilities.capabilityMatrix?.["screen.capture"]).toMatchObject({
      supported: true,
      outputModes: ["base64"],
    })
  })
})
