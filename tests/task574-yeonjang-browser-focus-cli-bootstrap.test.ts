import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task574 browser.focus CLI bootstrap", () => {
  it("starts core directly without a macOS Keychain helper", () => {
    const serve = readFileSync("packages/cli/src/commands/serve.ts", "utf8")
    const build = readFileSync("scripts/build-yeonjang-macos.sh", "utf8")
    const node = readFileSync("Yeonjang/src/node.rs", "utf8")

    expect(serve).toContain("await bootstrapAsync(undefined, { startupProgress: startup.progress })")
    expect(serve).not.toContain("createCliBrowserFocusBootstrapOptions")
    expect(build.toLowerCase()).not.toContain("keychain")
    expect(node).toContain("&settings.connection.password")
  })
})
