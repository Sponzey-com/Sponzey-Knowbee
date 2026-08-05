import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import type { SetupChecksResponse } from "../packages/webui/src/api/adapters/types.ts"
import type { ResourceReadState } from "../packages/webui/src/lib/resource-read-state.ts"
import { SetupReadStatusNotices } from "../packages/webui/src/pages/SetupPage.tsx"
import type { SetupCoreSnapshot } from "../packages/webui/src/stores/setup.ts"

const failure = {
  kind: "unknown",
  reasonCode: "private_setup_failure",
  messageKey: "request_failed",
  action: "refresh_state",
  actionLabelKey: "refresh_state",
} as const
const text = (ko: string) => ko
const noop = () => undefined

function idle<T>(): ResourceReadState<T> {
  return { status: "idle", data: null, observedAt: null, failure: null }
}

describe("Task052 setup read UI", () => {
  it("shows stale authoritative settings with one explicit refresh", () => {
    const coreReadState = {
      status: "stale",
      data: {} as SetupCoreSnapshot,
      observedAt: 1_000,
      failure,
    } satisfies ResourceReadState<SetupCoreSnapshot>

    const html = renderToStaticMarkup(
      createElement(SetupReadStatusNotices, {
        coreReadState,
        checksReadState: idle<SetupChecksResponse>(),
        text,
        onRefreshCore: noop,
        onRefreshChecks: noop,
      }),
    )

    expect(html).toContain("이전 정보를 표시하고 있습니다")
    expect(html).toContain("상태 새로고침")
    expect(html).not.toContain("private_setup_failure")
  })

  it("shows an independent checks failure through the safe projection", () => {
    const checksReadState = {
      status: "failed",
      data: null,
      observedAt: null,
      failure,
    } satisfies ResourceReadState<SetupChecksResponse>

    const html = renderToStaticMarkup(
      createElement(SetupReadStatusNotices, {
        coreReadState: idle<SetupCoreSnapshot>(),
        checksReadState,
        text,
        onRefreshCore: noop,
        onRefreshChecks: noop,
      }),
    )

    expect(html).toContain("설정 정보를 불러오지 못했습니다")
    expect(html).toContain("상태 새로고침")
    expect(html).not.toContain("private_setup_failure")
  })
})
