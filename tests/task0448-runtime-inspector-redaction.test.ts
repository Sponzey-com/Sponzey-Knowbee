import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "runs", "RunRuntimeInspectorPanel.tsx"),
  "utf-8",
)

describe("task0448 runtime inspector redaction", () => {
  it("does not render provider/model IDs directly in the selected sub-session model card", () => {
    expect(source).not.toContain("{selectedSubSession.model.providerId} / {selectedSubSession.model.modelId}")
    expect(source).toContain("runtimeModelIdentitySummary(selectedSubSession.model, text)")
  })

  it("maps expected output and review statuses through user-facing helpers", () => {
    expect(source).not.toContain("{output.kind} ·")
    expect(source).not.toContain("selectedSubSession.result?.status ??")
    expect(source).not.toContain("selectedSubSession.review?.verdict ??")
    expect(source).not.toContain("selectedSubSession.review?.parentIntegrationStatus ??")
    expect(source).toContain("expectedOutputKindLabel(output.kind, text)")
    expect(source).toContain("runtimeResultStatusLabel(selectedSubSession.result?.status, text)")
    expect(source).toContain("runtimeReviewVerdictLabel(selectedSubSession.review?.verdict, text)")
    expect(source).toContain("runtimeParentIntegrationStatusLabel(selectedSubSession.review?.parentIntegrationStatus, text)")
  })

  it("maps data exchange use and protection enums through user-facing helpers", () => {
    expect(source).not.toContain("{exchange.allowedUse} · {exchange.redactionState}")
    expect(source).toContain("dataExchangeAllowedUseLabel(exchange.allowedUse, text)")
    expect(source).toContain("dataExchangeRedactionStateLabel(exchange.redactionState, text)")
  })
})
