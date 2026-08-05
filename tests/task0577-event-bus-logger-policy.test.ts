import { afterEach, describe, expect, it, vi } from "vitest"

async function importEventsForCase(caseName: string) {
  expect(caseName).toBeTruthy()
  vi.resetModules()
  return import("../packages/core/src/events/index.ts")
}

function captureStderr() {
  return vi.spyOn(process.stderr, "write").mockImplementation(() => true)
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe("event bus logger policy", () => {
  it("routes unhandled listener errors through the redacting core logger", async () => {
    vi.stubEnv("KNOWBEE_NO_COLOR", "1")
    const stderr = captureStderr()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { eventBus } = await importEventsForCase("listener-error")
    const secret = "sk-task0577-event-secret-1234567890"
    const localPath = "/Users/dongwooshin/private/event-listener-secret.ts"
    let secondListenerCalled = false
    const unsubscribe = eventBus.on("config.changed", () => {
      throw new Error(`token=${secret} path=${localPath}`)
    })
    const unsubscribeSecond = eventBus.on("config.changed", () => {
      secondListenerCalled = true
    })

    expect(() => eventBus.emit("config.changed", {})).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 0))
    unsubscribe()
    unsubscribeSecond()

    const output = stderr.mock.calls.map((call) => String(call[0])).join("")
    expect(consoleError).not.toHaveBeenCalled()
    expect(secondListenerCalled).toBe(true)
    expect(output).toContain("Unhandled event listener error")
    expect(output).toContain('"event":"config.changed"')
    expect(output).toContain('"message":"token=*** path=[internal-path-redacted]"')
    expect(output).not.toContain(secret)
    expect(output).not.toContain(localPath)
  })
})
