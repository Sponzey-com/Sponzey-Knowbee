import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const appSource = readFileSync(new URL("../packages/webui/src/App.tsx", import.meta.url), "utf8")
const connectionSource = readFileSync(
  new URL("../packages/webui/src/stores/connection.ts", import.meta.url),
  "utf8",
)

describe("Task048 authenticated WebUI bootstrap", () => {
  it("uses the control-plane status adapter as the single authentication status owner", () => {
    expect(appSource).not.toContain('fetch("/api/status")')
    expect(appSource.match(/await api\.status\(\)/g)).toHaveLength(1)
  })

  it("seeds the connection store from the authenticated status response", () => {
    expect(connectionSource).toContain("acceptStatus: (status: StatusResponse) => void")
    expect(appSource).toContain("acceptConnectionStatus(status)")
  })

  it("starts secondary bootstrap owners only after authentication succeeds", () => {
    expect(appSource).toContain("if (authState !== true) return")
    expect(appSource).not.toContain("void initializeConnection()")
  })
})
