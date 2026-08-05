import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const cliFiles = [
  "../packages/cli/src/commands/serve.ts",
  "../packages/cli/src/commands/service/macos.ts",
  "../packages/cli/src/commands/service/linux.ts",
  "../packages/cli/src/commands/service/windows.ts",
  "../packages/cli/src/commands/run.ts",
  "../packages/cli/src/commands/smoke.ts",
  "../packages/cli/src/chunk-delivery.ts",
]

describe("CLI runtime env snapshot", () => {
  it("centralizes service env reads in the CLI runtime snapshot helper", () => {
    const helper = readFileSync(new URL("../packages/cli/src/runtime-env.ts", import.meta.url), "utf-8")

    expect(helper).toContain("const CLI_RUNTIME_ENV")
    expect(helper).toContain("process.env")
    expect(helper).toContain("KNOWBEE_NO_COLOR")
    expect(helper).toContain("KNOWBEE_CHANNEL_SMOKE_LIVE")

    for (const file of cliFiles) {
      const source = readFileSync(new URL(file, import.meta.url), "utf-8")

      expect(source, file).not.toContain("process.env")
      expect(source, file).toContain("runtime-env.js")
    }
  })
})
