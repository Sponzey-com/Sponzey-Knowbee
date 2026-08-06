import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task021 installer release workflows", () => {
  it("publishes rehearsal assets only to an existing exact prerelease after native evidence", () => {
    const workflow = readFileSync(".github/workflows/installer-rehearsal-publish.yml", "utf8")
    expect(workflow).toContain("Render unsigned native-gated rehearsal bootstraps")
    expect(workflow).toContain("compose-installer-release.mjs rehearsal")
    expect(workflow).toContain("installer-native-evidence-${{ inputs.release_tag }}")
    expect(workflow).toContain(
      'test "$(gh release view "$RELEASE_TAG" --json isPrerelease --jq .isPrerelease)" = true',
    )
    expect(workflow).toContain("installer-rehearsal-gate.json")
    expect(workflow).not.toMatch(/(?:signature|public-key|signing-response)/iu)
    expect(workflow).not.toContain("gh release create")
    expect(workflow).not.toMatch(/releases\/latest|--latest|--make-latest/iu)
  })

  it("aggregates only five GitHub-hosted clean-machine receipts for the exact candidate", () => {
    const workflow = readFileSync(".github/workflows/installer-clean-machine-evidence.yml", "utf8")
    expect(workflow).toContain("receipt_run_id")
    expect(workflow).toContain("GitHub-hosted clean-machine matrix")
    expect(workflow).toContain("installer-native-evidence-${{ inputs.release_tag }}")
    expect(workflow).toContain("pattern: installer-clean-machine-receipt-*")
    expect(workflow).toContain("compose-installer-clean-machine-evidence.mjs")
    expect(workflow).toContain("installer-clean-machine-evidence-${{ inputs.release_tag }}")
    expect(workflow).not.toMatch(/status['"]?\s*[:=]\s*['"]passed/iu)
  })
})
