import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { scanShellReferences } from "../scripts/self/lib/repository-reference-scanner.mjs"

const roots: string[] = []
const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), "knowbee-shell-"))
  roots.push(root)
  return root
}
const file = (root: string, path: string, content = "fixture\n"): void => {
  const absolute = join(root, path)
  mkdirSync(join(absolute, ".."), { recursive: true })
  writeFileSync(absolute, content, "utf8")
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe("task1189 shell reference scanner", () => {
  it("records explicit Unix and Windows script references without self references", () => {
    const root = fixture()
    file(root, "scripts/start.sh", "bash \"$ROOT_DIR/scripts/build.sh\"\necho scripts/start.sh\n")
    file(root, "scripts/build.sh")
    file(root, "scripts/start.bat", "call \"%SCRIPT_DIR%build.bat\"\r\n")
    file(root, "scripts/build.bat")

    const result = scanShellReferences({
      repositoryRoot: root,
      artifactIds: [
        "scripts/start.sh",
        "scripts/build.sh",
        "scripts/start.bat",
        "scripts/build.bat",
      ],
    })

    expect(result).toEqual({
      complete: true,
      diagnostics: [],
      records: [
        {
          boundary: "deployment",
          targetArtifactId: "scripts/build.bat",
          owner: "scripts/start.bat",
          detail: "shell:script-reference",
        },
        {
          boundary: "deployment",
          targetArtifactId: "scripts/build.sh",
          owner: "scripts/start.sh",
          detail: "shell:script-reference",
        },
      ],
    })
  })

  it("fails closed for an explicit missing scripts path", () => {
    const root = fixture()
    file(root, "scripts/start.sh", "bash scripts/missing.sh\n")

    const result = scanShellReferences({
      repositoryRoot: root,
      artifactIds: ["scripts/start.sh"],
    })

    expect(result).toEqual({
      complete: false,
      records: [],
      diagnostics: [{
        code: "shell_reference_unresolved",
        owner: "scripts/start.sh",
        reference: "scripts/missing.sh",
      }],
    })
  })
})
