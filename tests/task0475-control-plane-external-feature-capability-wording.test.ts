import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { createCapabilities } from "../packages/core/src/control-plane/index.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { translateDisplayText } from "../packages/webui/src/lib/ui-i18n.ts"

describe("control-plane external feature capability wording", () => {
  it("uses external feature connection wording in the mcp capability projection", () => {
    const capability = createCapabilities({ config: DEFAULT_CONFIG }).find((item) => item.key === "mcp.client")

    expect(capability?.label).toBe("External feature connections")
    expect(JSON.stringify(capability)).not.toContain("MCP 서버")
    expect(JSON.stringify(capability)).not.toContain("MCP Client")
  })

  it("keeps control-plane capability reasons aligned with WebUI translations", () => {
    expect(translateDisplayText("en", "외부 기능 연결이 설정되지 않았습니다.")).toBe(
      "No external feature connections are configured.",
    )
    expect(translateDisplayText("en", "설정된 외부 기능 연결이 아직 준비되지 않았습니다.")).toBe(
      "The configured external feature connections are not ready yet.",
    )

    const combined = [
      readFileSync("packages/core/src/control-plane/index.ts", "utf8"),
      readFileSync("packages/core/src/control-plane/index.js", "utf8"),
    ].join("\n")

    expect(combined).not.toContain("MCP Client")
    expect(combined).not.toContain("MCP 서버")
    expect(combined).toContain("External feature connections")
    expect(combined).toContain("외부 기능 연결이 설정되지 않았습니다.")
  })
})
