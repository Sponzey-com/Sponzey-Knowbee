import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const authTokenPanelSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "AuthTokenPanel.tsx"),
  "utf-8",
)

const remoteAccessFormSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "RemoteAccessForm.tsx"),
  "utf-8",
)

describe("task0444 token and channel detail redaction", () => {
  it("does not render saved auth token values in the status panel", () => {
    expect(authTokenPanelSource).not.toContain("{authToken}</div>")
    expect(authTokenPanelSource).not.toContain("새 로컬 auth token")
    expect(authTokenPanelSource).toContain("tokenStatusLabel(authToken, text)")
    expect(authTokenPanelSource).toContain('text("토큰 저장됨 · 값 숨김", "Token saved · value hidden")')
  })

  it("uses a password input for manual auth token editing", () => {
    expect(remoteAccessFormSource).toContain('type="password"')
    expect(remoteAccessFormSource).toContain('autoComplete="new-password"')
  })

})
