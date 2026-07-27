import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const prompts = join(process.cwd(), "prompts")
const prompt = (name: string): string => readFileSync(join(prompts, `${name}.md`), "utf8")

describe("task1269 maintenance-cleanup and UI-policy boundaries", () => {
  it("keeps maintenance_policy limited to evidenced cleanup, simplicity, and deletion validation", () => {
    const source = prompt("maintenance_policy")

    expect(source).toContain("Remove unused code, prompt sources, files, configuration, documents, tests, fixtures, generated artifacts, temporary files, backup files, and UI assets")
    expect(source).toContain("Keep one canonical owner")
    expect(source).toContain("Before deletion, check runtime references, test references, prompt registry references, migrations, user-data retention, deployment artifacts, recovery path, and validation method")
    expect(source).toContain("Separate cleanup-only changes from feature behavior changes")
    expect(source).toContain("does not own feature behavior")
    expect(source).not.toMatch(/Button labels must match persistence behavior|Route every user-facing natural-language answer/iu)
  })

  it("keeps ui_policy limited to convenience, accessibility, recovery, undo, and visible state", () => {
    const source = prompt("ui_policy")

    expect(source).toContain("Optimize UI changes for user convenience")
    expect(source).toContain("Keyboard navigation, visible focus, accessible names")
    expect(source).toContain("cancellation, undo")
    expect(source).toContain("Save actions must show success, failure, and unsaved-change state")
    expect(source).toContain("Button labels must match persistence behavior")
    expect(source).toContain("Hide `agent_id`, raw prompt stack, raw persona traits")
    expect(source).not.toMatch(/Record each cleanup candidate with artifact path|Classify every log event/iu)
  })
})
