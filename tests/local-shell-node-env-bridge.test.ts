import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const repoRoot = process.cwd()

function script(name: string): string {
  return readFileSync(join(repoRoot, "scripts", name), "utf-8")
}

describe("local shell embedded Node env bridge", () => {
  it("passes transient JSON and root values by argv instead of process env", () => {
    const start = script("knowbee-start.sh")
    const status = script("status-local.sh")

    expect(start).not.toContain("STATUS_JSON=")
    expect(status).not.toContain("KNOWBEE_STATUS_ROOT_DIR=")
    expect(start).not.toContain("process.env")
    expect(status).not.toContain("process.env")
  })

  it("keeps local runtime scripts syntactically valid", () => {
    for (const name of ["knowbee-start.sh", "status-local.sh"]) {
      execFileSync("bash", ["-n", join(repoRoot, "scripts", name)], { cwd: repoRoot })
    }
  })
})
