import { afterEach, describe, expect, it, vi } from "vitest"
import { localAdapter } from "../packages/webui/src/api/adapters/local"
import { api } from "../packages/webui/src/api/client"
import {
  UiRequestFailure,
  buildUiRequestFailure,
  projectUserRecovery,
} from "../packages/webui/src/lib/user-recovery"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

function installBrowserStorage(): void {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => null },
  })
}

describe("Task049 safe request failure boundary", () => {
  it("retains only structural status, safe message, and valid reason code", () => {
    const failure = buildUiRequestFailure({
      status: 503,
      statusText: "Service Unavailable /Users/private/project",
      bodyText: JSON.stringify({
        safeMessage: "The service is temporarily unavailable.",
        reasonCode: "service_unavailable",
        message: "token=secret",
        error: "Error at /Users/private/project/file.ts:42",
        issues: [{ message: "system prompt contents" }],
      }),
    })

    expect(failure).toBeInstanceOf(UiRequestFailure)
    expect(failure).toMatchObject({
      status: 503,
      reasonCode: "service_unavailable",
      safeMessage: "The service is temporarily unavailable.",
    })
    expect(JSON.stringify(failure)).not.toMatch(/secret|private\/project|system prompt/u)
  })

  it("drops untrusted text and invalid reason codes", () => {
    const failure = buildUiRequestFailure({
      status: 500,
      statusText: "Internal Error",
      bodyText: "<html>stack /tmp/private token=secret</html>",
    })

    expect(failure.reasonCode).toBe("request_failed")
    expect(failure.safeMessage).toBeNull()
    expect(failure.message).toBe("request_failed")
    expect(JSON.stringify(failure)).not.toMatch(/html|stack|private|secret/u)

    const directFailure = new UiRequestFailure({
      status: 500,
      reasonCode: "token=secret /tmp/private",
      safeMessage: null,
    })
    expect(directFailure.message).toBe("request_failed")
    expect(JSON.stringify(directFailure)).not.toMatch(/secret|private/u)
  })

  it("normalizes failures from both WebUI HTTP request boundaries", async () => {
    installBrowserStorage()
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            reasonCode: "service_unavailable",
            message: "stack /Users/private token=secret",
            issues: [{ message: "hidden prompt" }],
          }),
          { status: 503, statusText: "Internal /tmp/path" },
        ),
    ) as typeof fetch

    for (const operation of [localAdapter.getStatus(), api.getAgentWorkspace()]) {
      const failure = await operation.catch((cause: unknown) => cause)
      expect(failure).toBeInstanceOf(UiRequestFailure)
      expect(failure).toMatchObject({ status: 503, reasonCode: "service_unavailable" })
      expect(JSON.stringify(failure)).not.toMatch(/Users|secret|hidden prompt|tmp\/path/u)
    }
  })

  it("normalizes fetch rejection while preserving cancellation", async () => {
    installBrowserStorage()
    globalThis.fetch = vi.fn(async () => {
      throw new Error("connect failed /Users/private token=secret")
    }) as typeof fetch
    const networkFailure = await localAdapter.getStatus().catch((cause: unknown) => cause)
    expect(networkFailure).toMatchObject({ status: null, reasonCode: "network_unavailable" })
    expect(JSON.stringify(networkFailure)).not.toMatch(/Users|secret|connect failed/u)

    globalThis.fetch = vi.fn(async () => {
      throw new DOMException("cancelled", "AbortError")
    }) as typeof fetch
    const cancellation = await localAdapter.getStatus().catch((cause: unknown) => cause)
    expect(cancellation).toBeInstanceOf(DOMException)
    expect((cancellation as DOMException).name).toBe("AbortError")
  })
})

describe("Task049 user recovery projection", () => {
  it.each([
    [401, "authentication_required", "reauthorize"],
    [403, "permission_denied", "contact_admin"],
    [409, "mutation_revision_conflict", "refresh_state"],
    [422, "validation_failed", "edit_input"],
    [503, "service_unavailable", "refresh_state"],
    [501, "unsupported_operation", "choose_alternative"],
  ] as const)("maps %s/%s to %s", (status, reasonCode, action) => {
    const projection = projectUserRecovery(
      new UiRequestFailure({ status, reasonCode, safeMessage: null }),
      "read",
    )
    expect(projection.action).toBe(action)
    expect(projection).not.toHaveProperty("raw")
    expect(JSON.stringify(projection)).not.toContain("retry")
  })

  it("does not expose an unknown thrown value", () => {
    const projection = projectUserRecovery(
      { stack: "/tmp/private", token: "secret", prompt: "hidden" },
      "read",
    )
    expect(projection).toEqual({
      kind: "unknown",
      reasonCode: "request_failed",
      messageKey: "request_failed",
      action: "refresh_state",
      actionLabelKey: "refresh_state",
    })
    expect(JSON.stringify(projection)).not.toMatch(/private|secret|hidden/u)
  })
})
