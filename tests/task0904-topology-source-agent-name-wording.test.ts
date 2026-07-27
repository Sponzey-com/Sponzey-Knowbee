import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("task0904 topology source agent_name wording", () => {
  it("describes topology node names through agent_name instead of display-name wording", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/core/src/topology/source.md"),
      "utf-8",
    )

    expect(source).toContain("사용자-facing `agent_name`")
    expect(source).not.toContain("표시 이름")
  })
})
