import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const composerSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "BackendComposer.tsx"),
  "utf-8",
)
const healthCardSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "BackendHealthCard.tsx"),
  "utf-8",
)

describe("task0398 AI model source URL redaction", () => {
  it("does not keep model discovery source URL state in the AI connection composer", () => {
    expect(composerSource).not.toContain("sourceUrl")
    expect(composerSource).not.toContain("setSourceUrl")
    expect(composerSource).not.toContain("Source URL")
    expect(composerSource).not.toContain("조회 경로")
    expect(composerSource).toContain("successMessage")
    expect(composerSource).toContain("Connection confirmed")
  })

  it("does not render model discovery source URL in existing AI connection cards", () => {
    expect(healthCardSource).not.toContain("sourceUrl")
    expect(healthCardSource).not.toContain("setSourceUrl")
    expect(healthCardSource).not.toContain("Source URL")
    expect(healthCardSource).not.toContain("조회 경로")
    expect(healthCardSource).toContain("successMessage")
    expect(healthCardSource).toContain("Connection confirmed")
  })
})
