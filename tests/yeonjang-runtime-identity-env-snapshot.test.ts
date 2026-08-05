import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function exportedFunctionSlice(source: string, name: string): string {
  const marker = `export function ${name}`
  const start = source.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = source.indexOf("\nexport function ", start + marker.length)
  return source.slice(start, next === -1 ? undefined : next)
}

describe("Yeonjang runtime identity env snapshot", () => {
  it("keeps exported identity getters free of direct env reads", () => {
    const source = readFileSync(
      new URL("../packages/core/src/yeonjang/runtime-identity.ts", import.meta.url),
      "utf-8",
    )
    const getterNames = [
      "getYeonjangRuntimeHostname",
      "getDefaultYeonjangWorkspaceScopeId",
      "getDefaultYeonjangOwnerUserId",
      "getYeonjangGatewayHostFingerprint",
      "getYeonjangGatewayHostFingerprintPreview",
    ]

    expect(source).toContain("const YEONJANG_RUNTIME_IDENTITY = Object.freeze")
    expect(source).toContain('process.env["KNOWBEE_HOSTNAME"]')
    expect(source).toContain('process.env["KNOWBEE_YEONJANG_WORKSPACE_SCOPE_ID"]')
    expect(source).toContain('process.env["KNOWBEE_YEONJANG_OWNER_USER_ID"]')

    for (const getterName of getterNames) {
      const body = exportedFunctionSlice(source, getterName)
      if (getterName === "getYeonjangGatewayHostFingerprintPreview") {
        expect(body).toContain("getYeonjangGatewayHostFingerprint()")
      } else {
        expect(body).toContain("YEONJANG_RUNTIME_IDENTITY")
      }
      expect(body).not.toContain("process.env")
    }
  })
})
