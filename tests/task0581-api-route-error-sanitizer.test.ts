import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const routeFiles = [
  "agent.ts",
  "channel-smoke.ts",
  "memory.ts",
  "prompt-sources.ts",
]

function routeSource(fileName: string): string {
  return readFileSync(
    new URL(`../packages/core/src/api/routes/${fileName}`, import.meta.url),
    "utf-8",
  )
}

describe("api route user-facing error sanitization", () => {
  it.each(routeFiles)("does not send raw caught error messages in %s", (fileName) => {
    const source = routeSource(fileName)

    expect(source).not.toMatch(
      /send\(\s*\{[^}]*error:\s*error instanceof Error \? error\.message : String\(error\)/su,
    )
    expect(source).not.toMatch(
      /send\(\s*\{[^}]*message:\s*error instanceof Error \? error\.message : String\(error\)/su,
    )
  })

  it.each(routeFiles)("uses the shared user-facing sanitizer in %s", (fileName) => {
    const source = routeSource(fileName)

    expect(source).toContain("sanitizeUserFacingError")
  })
})
