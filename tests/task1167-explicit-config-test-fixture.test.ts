import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

const tempDirs: string[] = []

function tempRoot(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `knowbee-task1167-${name}-`))
  tempDirs.push(root)
  return root
}

afterEach(() => {
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe("task1167 explicit config test fixture", () => {
  it("keeps two environment and path fixtures isolated in one process", () => {
    const first = createTestRuntimeConfigFixture({
      rootDir: tempRoot("first"),
      env: { KNOWBEE_MQTT_HOST: "first-host" },
    })
    const second = createTestRuntimeConfigFixture({
      rootDir: tempRoot("second"),
      env: { KNOWBEE_MQTT_HOST: "second-host" },
    })

    expect(first.config.mqtt.host).toBe("first-host")
    expect(second.config.mqtt.host).toBe("second-host")
    expect(first.paths.stateDir).not.toBe(second.paths.stateDir)
  })

  it("keeps the original snapshot immutable and applies persisted changes only to a new load", () => {
    const fixture = createTestRuntimeConfigFixture({
      rootDir: tempRoot("reload"),
      configText: "{ profile: { profileName: 'before' } }",
    })

    writeFileSync(fixture.paths.configFile, "{ profile: { profileName: 'after' } }", "utf8")
    const reloaded = fixture.load()

    expect(fixture.config.profile.profileName).toBe("before")
    expect(reloaded.profile.profileName).toBe("after")
  })
})
