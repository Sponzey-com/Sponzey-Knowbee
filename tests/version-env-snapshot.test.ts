import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  createVersionEnvironmentSnapshot,
  getCurrentDisplayVersion,
} from "../packages/core/src/version.ts"

describe("version env snapshot", () => {
  it("keeps display version env fixed in an explicit snapshot", () => {
    const env: Record<string, string | undefined> = {
      KNOWBEE_DISPLAY_VERSION: "vTEST-SNAPSHOT",
      KNOWBEE_GIT_VERSION: undefined,
    }
    const snapshot = createVersionEnvironmentSnapshot(env)
    env.KNOWBEE_DISPLAY_VERSION = "vCHANGED"

    expect(getCurrentDisplayVersion(snapshot)).toBe("vTEST-SNAPSHOT")
  })

  it("keeps getCurrentDisplayVersion free of direct env reads", () => {
    const source = readFileSync(new URL("../packages/core/src/version.ts", import.meta.url), "utf-8")
    const functionBody = source.slice(source.indexOf("export function getCurrentDisplayVersion"))

    expect(source).toContain("const VERSION_ENV")
    expect(functionBody).not.toContain("process.env")
  })
})
