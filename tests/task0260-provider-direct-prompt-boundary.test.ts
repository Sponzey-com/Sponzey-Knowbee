import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const PROVIDER_DIRECT_MARKERS = [
  "provider direct",
  "explicit_provider",
  "explicit provider target",
  "legacy single-agent",
  "default workflow fallback",
  "jump to a provider",
  "call a provider",
  "fall through to provider",
] as const

describe("task0260 provider-direct prompt boundary", () => {
  it("keeps provider-direct fallback details owned by knowbee-execution only", () => {
    const promptsDir = join(process.cwd(), "prompts")
    const promptFiles = readdirSync(promptsDir)
      .filter((file) => file.endsWith(".md"))
      .sort()

    const offenders = promptFiles
      .filter((file) => file !== "knowbee-execution.md")
      .flatMap((file) => {
        const source = readFileSync(join(promptsDir, file), "utf-8").toLowerCase()
        return PROVIDER_DIRECT_MARKERS
          .filter((marker) => source.includes(marker))
          .map((marker) => `${file}:${marker}`)
      })

    expect(offenders).toEqual([])

    const canonical = readFileSync(join(promptsDir, "knowbee-execution.md"), "utf-8").toLowerCase()
    expect(canonical).toContain("provider direct")
    expect(canonical).toContain("explicit provider target")
  })
})
