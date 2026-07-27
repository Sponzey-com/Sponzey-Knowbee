import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { SetupSyncStatus } from "../packages/webui/src/components/setup/SetupSyncStatus.js"

const failure = {
  kind: "unavailable",
  reasonCode: "private_save_adapter_503",
  messageKey: "unavailable",
  action: "refresh_state",
  actionLabelKey: "refresh_state",
} as const

describe("Task056 settings save recovery", () => {
  it("stores a structured save projection without disconnecting Gateway", () => {
    const store = readFileSync(
      new URL("../packages/webui/src/stores/setup.ts", import.meta.url),
      "utf8",
    )
    const persist = store.slice(
      store.indexOf("async function persistSetupSnapshot"),
      store.indexOf("function queuePersist"),
    )
    expect(store).toContain("saveRecovery: UserRecoveryProjection | null")
    expect(store).toContain("setSaveRecovery: (recovery: UserRecoveryProjection | null) => void")
    expect(persist).toContain('projectUserRecovery(error, "mutation")')
    expect(persist).not.toContain("setDisconnected")
    expect(persist).not.toContain("error instanceof Error ? error.message")
    expect(persist).toContain("currentSaveSequence !== saveSequence")
  })

  it("projects a save acknowledgement mismatch as a recoverable conflict", () => {
    const page = readFileSync(
      new URL("../packages/webui/src/pages/SetupPage.tsx", import.meta.url),
      "utf8",
    )
    expect(page).toContain('reasonCode: "save_acknowledgement_mismatch"')
    expect(page).toContain('kind: "conflict"')
    expect(page).toContain("setSaveRecovery(null)")
  })

  it("renders only shared safe recovery copy", () => {
    const html = renderToStaticMarkup(
      createElement(SetupSyncStatus, {
        saving: false,
        lastSavedAt: null,
        saveRecovery: failure,
        onRecover: () => undefined,
      }),
    )
    expect(html).toContain("설정 정보를 불러오지 못했습니다")
    expect(html).toContain("상태 새로고침")
    expect(html).not.toContain("private_save_adapter_503")
  })

  it("forbids raw lastError rendering in the canonical status component", () => {
    const status = readFileSync(
      new URL("../packages/webui/src/components/setup/SetupSyncStatus.tsx", import.meta.url),
      "utf8",
    )
    expect(status).not.toContain("lastError: string")
    expect(status).not.toContain("displayText(lastError)")
    expect(status).toContain("UserRecoveryNotice")
    expect(status).toContain("recoveryRef.current?.focus()")
    expect(status).toContain("tabIndex={-1}")
  })
})
