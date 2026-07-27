import { describe, expect, it } from "vitest"
import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { fileListTool, fileReadTool } from "../packages/core/src/tools/builtin/file.ts"
import {
  yeonjangDiskExistsTool,
  yeonjangDiskInfoTool,
  yeonjangDiskUsageTool,
  yeonjangFileListTool,
  yeonjangFileMetadataTool,
  yeonjangFileReadTool,
} from "../packages/core/src/tools/builtin/yeonjang.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

const READ_ONLY_REMOTE_TOOLS = [
  "yeonjang_file_metadata",
  "yeonjang_file_list",
  "yeonjang_file_read",
  "yeonjang_disk_info",
  "yeonjang_disk_usage",
  "yeonjang_disk_exists",
] as const

describe("Task 035 Yeonjang Skill target contract", () => {
  it("marks Yeonjang file and disk read-only mappings as remote target tools", () => {
    for (const toolName of READ_ONLY_REMOTE_TOOLS) {
      const mapping = YEONJANG_TOOL_MAPPINGS.find((item) => item.toolName === toolName)

      expect(mapping, toolName).toMatchObject({
        targetKind: "yeonjang_remote",
        requiresTargetResolution: true,
        evidenceSourceKind: "yeonjang",
      })
    }
  })

  it("keeps local filesystem tools out of the Yeonjang built-in Skill catalog", () => {
    expect(YEONJANG_SKILL_TOOL_NAMES).toEqual(
      expect.arrayContaining([...READ_ONLY_REMOTE_TOOLS]),
    )
    expect(YEONJANG_SKILL_TOOL_NAMES).not.toEqual(
      expect.arrayContaining([
        "file_read",
        "file_list",
        "file_write",
        "file_patch",
        "file_delete",
        "file_search",
      ]),
    )
  })

  it("keeps Yeonjang and local file evidence source kinds separated", () => {
    for (const tool of [
      yeonjangFileMetadataTool,
      yeonjangFileListTool,
      yeonjangFileReadTool,
      yeonjangDiskInfoTool,
      yeonjangDiskUsageTool,
      yeonjangDiskExistsTool,
    ]) {
      expect(tool.evidenceSourceKind, tool.name).toBe("yeonjang")
      expect(tool.name).toMatch(/^yeonjang_(file|disk)_/u)
    }

    expect(fileReadTool.evidenceSourceKind).toBe("file")
    expect(fileListTool.evidenceSourceKind).toBe("file")
    expect(fileReadTool.name).toBe("file_read")
    expect(fileListTool.name).toBe("file_list")
  })
})

