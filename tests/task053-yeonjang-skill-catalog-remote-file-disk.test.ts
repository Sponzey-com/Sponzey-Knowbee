import { describe, expect, it } from "vitest"
import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { fileListTool, fileReadTool, fileWriteTool } from "../packages/core/src/tools/builtin/file.ts"
import {
  yeonjangDiskExistsTool,
  yeonjangDiskInfoTool,
  yeonjangDiskUsageTool,
  yeonjangFileListTool,
  yeonjangFileMetadataTool,
  yeonjangFileReadTool,
  yeonjangFileSearchTool,
} from "../packages/core/src/tools/builtin/yeonjang.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

const REMOTE_READ_ONLY_FILE_DISK_TOOLS = [
  {
    toolName: "yeonjang_file_metadata",
    methodIds: ["file.metadata"],
    permissionSetting: "allow_file_read",
    descriptor: yeonjangFileMetadataTool,
  },
  {
    toolName: "yeonjang_file_list",
    methodIds: ["file.list"],
    permissionSetting: "allow_file_read",
    descriptor: yeonjangFileListTool,
  },
  {
    toolName: "yeonjang_file_read",
    methodIds: ["file.read"],
    permissionSetting: "allow_file_read",
    descriptor: yeonjangFileReadTool,
  },
  {
    toolName: "yeonjang_file_search",
    methodIds: ["file.search"],
    permissionSetting: "allow_file_read",
    descriptor: yeonjangFileSearchTool,
  },
  {
    toolName: "yeonjang_disk_info",
    methodIds: ["disk.info"],
    permissionSetting: "allow_disk_read",
    descriptor: yeonjangDiskInfoTool,
  },
  {
    toolName: "yeonjang_disk_usage",
    methodIds: ["disk.usage"],
    permissionSetting: "allow_disk_read",
    descriptor: yeonjangDiskUsageTool,
  },
  {
    toolName: "yeonjang_disk_exists",
    methodIds: ["disk.exists"],
    permissionSetting: "allow_disk_read",
    descriptor: yeonjangDiskExistsTool,
  },
] as const

describe("Task 053 Yeonjang Skill catalog remote file/disk mapping", () => {
  it("exposes all remote file and disk read-only tools through skill:yeonjang", () => {
    for (const expected of REMOTE_READ_ONLY_FILE_DISK_TOOLS) {
      expect(YEONJANG_SKILL_TOOL_NAMES, expected.toolName).toContain(expected.toolName)
      expect(expected.descriptor).toMatchObject({
        name: expected.toolName,
        evidenceSourceKind: "yeonjang",
        runtimeHealthMode: "required",
        runtimeMethodIds: expected.methodIds,
        riskLevel: "safe",
        requiresApproval: false,
      })
    }
  })

  it("keeps remote target mapping and permission settings aligned with tool descriptors", () => {
    for (const expected of REMOTE_READ_ONLY_FILE_DISK_TOOLS) {
      const mapping = YEONJANG_TOOL_MAPPINGS.find((item) => item.toolName === expected.toolName)

      expect(mapping, expected.toolName).toMatchObject({
        toolName: expected.toolName,
        methodIds: expected.methodIds,
        riskLevel: "safe",
        requiresApproval: false,
        targetKind: "yeonjang_remote",
        requiresTargetResolution: true,
        evidenceSourceKind: "yeonjang",
        permissionSetting: expected.permissionSetting,
      })
    }
  })

  it("does not mix local filesystem tools into the Yeonjang Skill catalog or evidence source", () => {
    expect(YEONJANG_SKILL_TOOL_NAMES).not.toEqual(
      expect.arrayContaining(["file_read", "file_list", "file_write", "file_patch", "file_delete"]),
    )
    expect(fileReadTool).toMatchObject({ name: "file_read", evidenceSourceKind: "file" })
    expect(fileListTool).toMatchObject({ name: "file_list", evidenceSourceKind: "file" })
    expect(fileWriteTool).toMatchObject({ name: "file_write", evidenceSourceKind: "file" })
  })
})
