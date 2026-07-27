import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  buildSkillsSetupDraft,
  testMcpServerConnection,
  testSkillPath,
} from "../packages/core/src/control-plane/setup-extensions.ts"
import { translateDisplayText } from "../packages/webui/src/lib/ui-i18n.ts"

function localSkillConfig(path: string) {
  return {
    skills: {
      items: [
        {
          id: "skill:local",
          label: "자료 정리",
          description: "자료를 정리합니다.",
          source: "local",
          path,
          enabled: true,
          required: true,
        },
      ],
    },
  } as Parameters<typeof buildSkillsSetupDraft>[0]
}

describe("setup extension backend user-facing wording", () => {
  it("uses work ability wording in local path validation results", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-work-ability-"))
    const file = join(root, "ability.md")
    writeFileSync(file, "# ability\n")

    try {
      expect(buildSkillsSetupDraft(localSkillConfig("")).items[0]?.reason).toBe("로컬 작업 능력 경로를 입력해야 합니다.")
      expect(buildSkillsSetupDraft(localSkillConfig(join(root, "missing"))).items[0]?.reason).toBe("입력한 작업 능력 경로를 찾을 수 없습니다.")
      expect(buildSkillsSetupDraft(localSkillConfig(root)).items[0]?.reason).toBe("로컬 작업 능력 폴더를 찾았습니다.")
      expect(buildSkillsSetupDraft(localSkillConfig(file)).items[0]?.reason).toBe("로컬 작업 능력 파일을 찾았습니다.")

      expect(testSkillPath("").message).toBe("작업 능력 경로를 입력해야 합니다.")
      expect(testSkillPath(join(root, "missing")).message).toBe("입력한 작업 능력 경로를 찾을 수 없습니다.")
      expect(testSkillPath(root).message).toBe("작업 능력 폴더를 확인했습니다.")
      expect(testSkillPath(file).message).toBe("작업 능력 파일을 확인했습니다.")
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("uses external feature connection wording for HTTP setup test messages", async () => {
    const result = await testMcpServerConnection({
      id: "external:http",
      name: "External HTTP",
      transport: "http",
      command: "",
      argsText: "",
      cwd: "",
      url: "https://example.test/mcp",
      required: false,
      enabled: true,
      status: "planned",
      tools: [],
    }, process.cwd())

    expect(result).toMatchObject({
      ok: false,
      message: "HTTP 방식 외부 기능 연결은 아직 준비 중입니다. 지금은 stdio 방식만 사용할 수 있습니다.",
      tools: [],
    })
    expect(translateDisplayText("en", result.message)).toBe("HTTP transport external feature connections are not ready yet. Only stdio transport is available right now.")
    expect(result.message).not.toContain("MCP")
  })
})
