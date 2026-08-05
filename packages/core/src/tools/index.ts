export { ToolDispatcher } from "./dispatcher.js"
export {
  getToolDispatcher,
  initializeToolDispatcher,
  toolDispatcher,
} from "./runtime-dispatcher.js"
export type { AgentScopedToolDispatchInput } from "./dispatcher.js"
export type { AgentTool, AnyTool, ToolContext, ToolResult, RiskLevel } from "./types.js"

export {
  fileReadTool,
  fileWriteTool,
  fileListTool,
  fileDeleteTool,
  filePatchTool,
} from "./builtin/file.js"
export { shellExecTool } from "./builtin/shell.js"
export { yeonjangBroadcastRunTool } from "./builtin/yeonjang-broadcast.js"
export { fileSearchTool } from "./builtin/file-search.js"
export { processListTool, processKillTool } from "./builtin/process.js"
export { appLaunchTool, appListTool } from "./builtin/app.js"
export { memoryStoreTool, memorySearchTool, fileSemanticSearchTool } from "./builtin/memory.js"
export { screenCaptureTool, screenFindTextTool } from "./builtin/ui/screen.js"
export { mouseMoveTool, mouseClickTool, mouseActionTool } from "./builtin/ui/mouse.js"
export {
  keyboardTypeTool,
  keyboardShortcutTool,
  keyboardActionTool,
} from "./builtin/ui/keyboard.js"
export { clipboardReadTool, clipboardWriteTool } from "./builtin/ui/clipboard.js"
export { windowListTool, windowFocusTool } from "./builtin/ui/window.js"
export {
  yeonjangCameraListTool,
  yeonjangCameraPermissionStatusTool,
  yeonjangCameraCaptureTool,
  yeonjangFileMetadataTool,
  yeonjangFileListTool,
  yeonjangFileReadTool,
  yeonjangFileSearchTool,
  yeonjangFileWriteTool,
  yeonjangFilePatchTool,
  yeonjangFileDeleteTool,
  yeonjangDiskInfoTool,
  yeonjangDiskUsageTool,
  yeonjangDiskExistsTool,
  yeonjangProcessListTool,
  yeonjangProcessInfoTool,
  yeonjangBrowserListTool,
  yeonjangBrowserActiveHintTool,
  yeonjangBrowserOpenUrlTool,
  yeonjangBrowserFocusTool,
  yeonjangClipboardReadTool,
  yeonjangClipboardWriteTool,
  yeonjangNetworkStatusTool,
  yeonjangDeviceStatusTool,
} from "./builtin/yeonjang.js"
export { yeonjangStatusTool } from "./builtin/yeonjang-status.js"
export { telegramSendFileTool } from "./builtin/telegram-send.js"
export { webFetchTool } from "./builtin/web-fetch.js"
export { webSearchTool } from "./builtin/web-search.js"

import { appLaunchTool, appListTool } from "./builtin/app.js"
import { fileSearchTool } from "./builtin/file-search.js"
import {
  fileDeleteTool,
  fileListTool,
  filePatchTool,
  fileReadTool,
  fileWriteTool,
} from "./builtin/file.js"
import { fileSemanticSearchTool, memorySearchTool, memoryStoreTool } from "./builtin/memory.js"
import { processKillTool, processListTool } from "./builtin/process.js"
import { shellExecTool } from "./builtin/shell.js"
import { yeonjangBroadcastRunTool } from "./builtin/yeonjang-broadcast.js"
import { telegramSendFileTool } from "./builtin/telegram-send.js"
import { webFetchTool } from "./builtin/web-fetch.js"
import { webSearchTool } from "./builtin/web-search.js"
import { clipboardReadTool, clipboardWriteTool } from "./builtin/ui/clipboard.js"
import {
  keyboardActionTool,
  keyboardShortcutTool,
  keyboardTypeTool,
} from "./builtin/ui/keyboard.js"
import { mouseActionTool, mouseClickTool, mouseMoveTool } from "./builtin/ui/mouse.js"
import { screenCaptureTool, screenFindTextTool } from "./builtin/ui/screen.js"
import { windowFocusTool, windowListTool } from "./builtin/ui/window.js"
import {
  yeonjangCameraCaptureTool,
  yeonjangCameraListTool,
  yeonjangCameraPermissionStatusTool,
  yeonjangFileMetadataTool,
  yeonjangFileListTool,
  yeonjangFileReadTool,
  yeonjangFileSearchTool,
  yeonjangFileWriteTool,
  yeonjangFilePatchTool,
  yeonjangFileDeleteTool,
  yeonjangDiskInfoTool,
  yeonjangDiskUsageTool,
  yeonjangDiskExistsTool,
  yeonjangProcessListTool,
  yeonjangProcessInfoTool,
  yeonjangBrowserListTool,
  yeonjangBrowserActiveHintTool,
  yeonjangBrowserOpenUrlTool,
  yeonjangBrowserFocusTool,
  yeonjangClipboardReadTool,
  yeonjangClipboardWriteTool,
  yeonjangNetworkStatusTool,
  yeonjangDeviceStatusTool,
} from "./builtin/yeonjang.js"
import { yeonjangStatusTool } from "./builtin/yeonjang-status.js"
import type { ToolDispatcher } from "./dispatcher.js"

export function registerBuiltinTools(dispatcher: ToolDispatcher): void {
  dispatcher.registerAll([
    // File tools
    fileReadTool,
    fileWriteTool,
    fileListTool,
    fileDeleteTool,
    filePatchTool,
    // Shell
    shellExecTool,
    // Local search
    fileSearchTool,
    // Process / App
    processListTool,
    processKillTool,
    appLaunchTool,
    appListTool,
    // Memory
    memoryStoreTool,
    memorySearchTool,
    fileSemanticSearchTool,
    // UI Automation
    screenCaptureTool,
    screenFindTextTool,
    mouseMoveTool,
    mouseClickTool,
    mouseActionTool,
    keyboardTypeTool,
    keyboardShortcutTool,
    keyboardActionTool,
    clipboardReadTool,
    clipboardWriteTool,
    windowListTool,
    windowFocusTool,
    // Yeonjang extension
    yeonjangStatusTool,
    yeonjangBroadcastRunTool,
    yeonjangCameraListTool,
    yeonjangCameraPermissionStatusTool,
    yeonjangCameraCaptureTool,
    yeonjangFileMetadataTool,
    yeonjangFileListTool,
    yeonjangFileReadTool,
    yeonjangFileSearchTool,
    yeonjangFileWriteTool,
    yeonjangFilePatchTool,
    yeonjangFileDeleteTool,
    yeonjangDiskInfoTool,
    yeonjangDiskUsageTool,
    yeonjangDiskExistsTool,
    yeonjangProcessListTool,
    yeonjangProcessInfoTool,
    yeonjangBrowserListTool,
    yeonjangBrowserActiveHintTool,
    yeonjangBrowserOpenUrlTool,
    yeonjangBrowserFocusTool,
    yeonjangClipboardReadTool,
    yeonjangClipboardWriteTool,
    yeonjangNetworkStatusTool,
    yeonjangDeviceStatusTool,
    // Channel delivery
    telegramSendFileTool,
    // Built-in public web retrieval
    webSearchTool,
    webFetchTool,
  ])
}
