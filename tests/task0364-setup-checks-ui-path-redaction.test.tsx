import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { SetupChecksPanel } from "../packages/webui/src/components/setup/SetupChecksPanel.tsx"
import type { SetupChecksResponse } from "../packages/webui/src/api/adapters/types.ts"

const setupPageSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "pages", "SetupPage.tsx"), "utf-8")

function checks(): SetupChecksResponse {
  return {
    stateDir: "/tmp/knowbee-private-state",
    configFile: "/tmp/knowbee-private-state/config.json5",
    setupStateFile: "[internal-path-redacted]",
    setupCompleted: true,
    telegramConfigured: true,
    authEnabled: true,
    schedulerEnabled: true,
  }
}

describe("task0364 setup checks UI path redaction", () => {
  it("renders setup storage status without raw paths or redaction placeholders", () => {
    const html = renderToStaticMarkup(
      createElement(SetupChecksPanel, {
        checks: checks(),
        loading: false,
        onRefresh: () => undefined,
      }),
    )

    expect(html).not.toContain("/tmp/knowbee-private-state")
    expect(html).not.toContain("[internal-path-redacted]")
    expect(html).not.toMatch(/State Dir|Config File|Setup State/u)
    expect(html).toContain("로컬 저장소")
    expect(html).toContain("설정 저장")
    expect(html).toContain("진행 상태 저장")
  })

  it("does not render setup completion cards from raw check path fields", () => {
    expect(setupPageSource).not.toContain('label="Config File" value={checks?.configFile')
    expect(setupPageSource).not.toContain('label="Setup State" value={checks?.setupStateFile')
    expect(setupPageSource).toContain('label="로컬 저장소"')
    expect(setupPageSource).toContain('label="설정 상태"')
  })
})
