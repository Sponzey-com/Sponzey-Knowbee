import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function functionSlice(source: string, name: string): string {
  return source.slice(source.indexOf(`function ${name}`))
}

describe("CLI color env snapshot", () => {
  it("keeps CLI color helpers free of direct env reads", () => {
    const chunkDelivery = readFileSync(new URL("../packages/cli/src/chunk-delivery.ts", import.meta.url), "utf-8")
    const runCommand = readFileSync(new URL("../packages/cli/src/commands/run.ts", import.meta.url), "utf-8")

    expect(chunkDelivery).toContain("isCliNoColorDisabled")
    expect(runCommand).toContain("isCliNoColorDisabled")
    expect(functionSlice(chunkDelivery, "useColor")).not.toContain("process.env")
    expect(functionSlice(runCommand, "useColor")).not.toContain("process.env")
  })
})
