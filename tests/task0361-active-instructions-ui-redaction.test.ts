import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const clientSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "api", "client.ts"), "utf-8")
const panelSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "ActiveInstructionsPanel.tsx"),
  "utf-8",
)
const dashboardSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "pages", "DashboardPage.tsx"), "utf-8")
const auditSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "pages", "AuditPage.tsx"), "utf-8")

function methodBody(methodName: string, nextMethodName: string): string {
  const start = clientSource.indexOf(`${methodName}:`)
  const end = clientSource.indexOf(`${nextMethodName}:`, start + methodName.length)
  if (start < 0 || end < 0) throw new Error(`Could not extract ${methodName}`)
  return clientSource.slice(start, end)
}

describe("task0361 active instructions UI redaction defaults", () => {
  it("uses redacted disclosure for default active instruction and prompt source reads", () => {
    for (const [methodName, nextMethodName] of [
      ["instructionsActive", "instructionsActiveRaw"],
      ["promptSources", "promptSourcesRaw"],
      ["promptSourcesDryRun", "promptSourcesDryRunRaw"],
      ["promptSourcesRegression", "promptSourcesRegressionRaw"],
    ] as const) {
      const body = methodBody(methodName, nextMethodName)
      expect(body).toContain('redactionMode: "redacted"')
      expect(body).not.toContain('redactionMode: "raw_authorized"')
    }
  })

  it("keeps raw prompt reads behind explicit raw-only client methods", () => {
    expect(clientSource).toContain("instructionsActiveRaw:")
    expect(clientSource).toContain("promptSourceRaw:")
    expect(clientSource).toContain("promptSourcesRaw:")
    expect(clientSource).toContain("promptSourcesDryRunRaw:")
    expect(clientSource).toContain("promptSourcesRegressionRaw:")
  })

  it("requires explicit targets for raw prompt source client methods", () => {
    expect(methodBody("instructionsActiveRaw", "promptSources")).toContain('target: "active-instructions"')
    expect(methodBody("promptSourcesRaw", "promptSource")).toContain('target: "prompt-source-registry"')
    expect(methodBody("promptSourceRaw", "promptSourcesDryRun")).toContain("target: `prompt-source:${sourceId}:${locale}`")
    expect(methodBody("promptSourcesDryRunRaw", "promptSourcesParity")).toContain("target: `prompt-assembly:${locale}`")
    expect(methodBody("promptSourcesRegressionRaw", "writePromptSource")).toContain("target: `prompt-regression:${locale}`")
  })

  it("does not auto-load raw prompt source documents from the default panel lifecycle", () => {
    expect(panelSource).toContain("allowRawPromptEditing = false")
    expect(panelSource).toContain("rawEditorOpen")
    expect(panelSource).toContain("api.promptSourceRaw(")
    expect(panelSource).not.toContain("api.promptSource(")
    expect(panelSource).toContain("data.disclosure.state === \"raw_authorized\"")
  })

  it("keeps instruction diagnostics out of the ordinary dashboard surface", () => {
    expect(dashboardSource).not.toContain("ActiveInstructionsPanel")
    expect(dashboardSource).not.toContain("instructionsActive")
  })

  it("mounts instruction diagnostics only after an explicit action on the audit surface", () => {
    expect(auditSource).toContain("instructionsOpen")
    expect(auditSource).toContain("aria-expanded={instructionsOpen}")
    expect(auditSource).toContain("instructionsOpen ? (")
    expect(auditSource).toContain("<ActiveInstructionsPanel allowRawPromptEditing />")
  })
})
