import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function source(...parts: string[]): string {
  return readFileSync(join(process.cwd(), "packages", "webui", "src", "components", "setup", ...parts), "utf-8")
}

const yeonjangFleet = source("YeonjangFleetPanel.tsx")

describe("task0445 channel credential inputs", () => {
  it("hides Yeonjang connection approval codes while editing", () => {
    expect(yeonjangFleet).toMatch(/type="password"[\s\S]*value=\{pairingSecret\}/)
    expect(yeonjangFleet).toMatch(/autoComplete="new-password"[\s\S]*value=\{pairingSecret\}/)
  })
})
