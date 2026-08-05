import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf-8")
}

describe("delivery and start failure detail redaction", () => {
  it("does not persist raw delivery error expressions in delivery diagnostics", () => {
    const deliverySource = source("packages/core/src/runs/delivery.ts")

    expect(deliverySource).toContain("function safeDeliveryErrorMessage")
    expect(deliverySource).toContain("const message = safeDeliveryErrorMessage(error)")
    expect(deliverySource).toContain("sanitizeUserFacingError(`chunk delivery failed: ${safeErrorMessage}`)")
    expect(deliverySource).not.toContain("const rawMessage = error instanceof Error ? error.message : String(error)")
    expect(deliverySource).not.toContain("error: error instanceof Error ? error.message : String(error)")
  })

  it("does not append raw sub-agent dispatch error expressions to run events", () => {
    const startSource = source("packages/core/src/runs/start.ts")

    expect(startSource).toContain("function safeRunErrorMessage")
    expect(startSource).toContain("const message = safeRunErrorMessage(error)")
    expect(startSource).toContain("`sub_agent_dispatch_failed:${message}`")
    expect(startSource).not.toContain("`sub_agent_dispatch_failed:${error instanceof Error ? error.message : String(error)}`")
    expect(startSource).not.toContain("error: error instanceof Error ? error.message : String(error)")
  })
})
