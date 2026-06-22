/**
 * Screen capture tools.
 * Uses @nut-tree/nut-js when available, falls back to platform CLI tools.
 */

import { tmpdir } from "node:os"
import { join } from "node:path"
import { readFileSync, unlinkSync, writeFileSync } from "node:fs"
import type { AgentTool, ArtifactDeliveryResultDetails, ToolResult } from "../../types.js"
import {
  DEFAULT_YEONJANG_EXTENSION_ID,
  isYeonjangUnavailableError,
  type YeonjangClientOptions,
} from "../../../yeonjang/mqtt-client.js"
import {
  buildYeonjangTargetParameterProperties,
  buildYeonjangTargetResolutionDetails,
  buildYeonjangTargetSelectionFailure,
  recordYeonjangRemoteExecutionApproval,
  revalidateYeonjangTargetSelection,
  resolveYeonjangTargetSelection,
  type YeonjangTargetedToolParams,
} from "../yeonjang-target.js"
import { withYeonjangRequestMetadata } from "../yeonjang-request-metadata.js"
import {
  captureScreenViaYeonjang,
  classifyYeonjangScreenCaptureFailure,
  preflightYeonjangScreenCapture,
  saveInlineScreenCapture,
  statArtifactSize,
  yeonjangRequiredFailure,
} from "./yeonjang-screen-shared.js"

interface ScreenCaptureParams extends YeonjangTargetedToolParams {
  display?: number | string
}

interface ScreenFindTextParams extends YeonjangTargetedToolParams {
  text: string
}

function resolveRequestedDisplay(display: number | string | undefined, userMessage: string): number | undefined {
  if (typeof display === "number" && Number.isInteger(display) && display >= 0) return display
  if (typeof display === "string") {
    const trimmed = display.trim().toLowerCase()
    if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10)
    if (trimmed === "main" || trimmed === "primary") return 0
    if (trimmed === "secondary" || trimmed === "external") return 1
  }

  const trimmedMessage = userMessage.trim()
  const koreanOrdinal = trimmedMessage.match(/(\d+)\s*(?:번째|번)\s*(?:모니터|디스플레이|화면)/u)
  if (koreanOrdinal) {
    const ordinal = Number.parseInt(koreanOrdinal[1] ?? "", 10)
    if (Number.isInteger(ordinal) && ordinal > 0) return ordinal - 1
  }

  const englishOrdinal = trimmedMessage.match(/\b(\d+)(?:st|nd|rd|th)?\s+(?:monitor|display|screen)\b/i)
  if (englishOrdinal) {
    const ordinal = Number.parseInt(englishOrdinal[1] ?? "", 10)
    if (Number.isInteger(ordinal) && ordinal > 0) return ordinal - 1
  }

  if (/(외부\s*모니터|서브\s*모니터|보조\s*모니터|두\s*번째\s*모니터|두번째\s*모니터)/u.test(trimmedMessage)) return 1
  if (/\b(?:second|secondary|external)\s+(?:monitor|display|screen)\b/i.test(trimmedMessage)) return 1
  if (/(메인\s*모니터|주\s*모니터|기본\s*모니터)/u.test(trimmedMessage)) return 0
  if (/\b(?:main|primary)\s+(?:monitor|display|screen)\b/i.test(trimmedMessage)) return 0

  return undefined
}

export const screenCaptureTool: AgentTool<ScreenCaptureParams> = {
  name: "screen_capture",
  description: "현재 화면을 캡처하여 base64 PNG 이미지로 반환합니다. 특정 모니터를 캡처하려면 display를 지정하세요. 예: 메인 모니터=0, 두 번째 모니터=1.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      display: {
        type: "integer",
        description: "캡처할 모니터 인덱스. 0은 메인, 1은 두 번째 모니터입니다. 사용자가 특정 모니터를 지목한 경우 지정합니다.",
      },
    },
    required: [],
  },
  riskLevel: "safe",
  requiresApproval: false,
  execute: async (params, ctx): Promise<ToolResult> => {
    const selection = resolveYeonjangTargetSelection({
      requestedExtensionId: params.extensionId,
      targetSelector: params.targetSelector,
      expectedTargetSessionId: params.targetSessionId,
      userMessage: ctx.userMessage,
    })
    if (!selection.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(selection),
      }
    }
    const extensionId = selection.extensionId
    const yeonjangOptions = withYeonjangRequestMetadata(ctx, extensionId ? {
      extensionId,
      ...(selection.targetSessionId ? { metadata: { targetSessionId: selection.targetSessionId } } : {}),
    } : {})
    const display = resolveRequestedDisplay(params.display, ctx.userMessage)
    try {
      const preflightFailure = await preflightYeonjangScreenCapture(yeonjangOptions)
      if (preflightFailure) {
        return {
          ...preflightFailure,
          details: {
            ...(preflightFailure.details && typeof preflightFailure.details === "object" ? preflightFailure.details as Record<string, unknown> : {}),
            ...buildYeonjangTargetResolutionDetails(selection),
          },
        }
      }

      const reboundSelection = revalidateYeonjangTargetSelection({ selection })
      if (!reboundSelection.ok) {
        return {
          success: false,
          ...buildYeonjangTargetSelectionFailure(reboundSelection),
        }
      }
      recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "screen.capture", ctx })
      {
        const { base64, remote } = await captureScreenViaYeonjang({
          options: yeonjangOptions,
          ...(display !== undefined ? { display } : {}),
        })
        const localSavedPath = saveInlineScreenCapture(base64, remote.mime_type)
        const localFileSize = statArtifactSize(localSavedPath)
        const artifactChannel = ctx.source === "webui" || ctx.source === "telegram" || ctx.source === "slack"
          ? ctx.source
          : null
        const artifactDetails: ArtifactDeliveryResultDetails | undefined = artifactChannel && localSavedPath
          ? {
              kind: "artifact_delivery",
              channel: artifactChannel,
              filePath: localSavedPath,
              mimeType: remote.mime_type ?? "image/png",
              size: localFileSize,
              source: ctx.source,
            }
          : undefined
        return {
          success: true,
          output: `Yeonjang 스크린샷 캡처 완료.\n로컬 저장: ${localSavedPath}`,
          details: {
            via: "yeonjang",
            fileName: remote.file_name,
            fileExtension: remote.file_extension,
            mimeType: remote.mime_type ?? "image/png",
            sizeBytes: remote.size_bytes,
            transferEncoding: "base64",
            localSavedPath,
            localFileSize,
            ...buildYeonjangTargetResolutionDetails(reboundSelection),
            ...(display !== undefined ? { display } : {}),
            ...(artifactDetails ?? {}),
          },
        }
      }
    } catch (error) {
      if (!isYeonjangUnavailableError(error)) {
        const message = error instanceof Error ? error.message : String(error)
        const classified = classifyYeonjangScreenCaptureFailure(message)
        return {
          success: false,
          output: classified.output,
          error: classified.code,
          details: {
            ...classified.details,
            ...(extensionId ? { extensionId } : {}),
            ...buildYeonjangTargetResolutionDetails(selection),
          },
        }
      }
    }
    const failure = yeonjangRequiredFailure("screen.capture")
    return {
      ...failure,
      details: {
        ...(failure.details && typeof failure.details === "object" ? failure.details as Record<string, unknown> : {}),
        ...buildYeonjangTargetResolutionDetails(selection),
      },
    }
  },
}

export const screenFindTextTool: AgentTool<ScreenFindTextParams> = {
  name: "screen_find_text",
  description: "현재 화면에서 특정 텍스트의 위치를 찾습니다. OCR을 사용합니다 (tesseract 필요).",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "찾을 텍스트" },
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
    },
    required: ["text"],
  },
  riskLevel: "safe",
  requiresApproval: false,
  execute: async (params: ScreenFindTextParams, ctx): Promise<ToolResult> => {
    const selection = resolveYeonjangTargetSelection({
      requestedExtensionId: params.extensionId,
      targetSelector: params.targetSelector,
      expectedTargetSessionId: params.targetSessionId,
      userMessage: ctx.userMessage || params.text,
    })
    if (!selection.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(selection),
      }
    }
    const extensionId = selection.extensionId
    try {
      const yeonjangOptions = withYeonjangRequestMetadata(ctx, extensionId ? {
        extensionId,
        ...(selection.targetSessionId ? { metadata: { targetSessionId: selection.targetSessionId } } : {}),
      } : {})
      const preflightFailure = await preflightYeonjangScreenCapture(yeonjangOptions)
      if (preflightFailure) {
        return {
          ...preflightFailure,
          details: {
            ...(preflightFailure.details && typeof preflightFailure.details === "object" ? preflightFailure.details as Record<string, unknown> : {}),
            ...buildYeonjangTargetResolutionDetails(selection),
          },
        }
      }
      const reboundSelection = revalidateYeonjangTargetSelection({ selection })
      if (!reboundSelection.ok) {
        return {
          success: false,
          ...buildYeonjangTargetSelectionFailure(reboundSelection),
        }
      }
      recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "screen.capture", ctx })
      const tmpPng = join(tmpdir(), `knowbee-screen-ocr-${Date.now()}.png`)
      const tmpTxt = join(tmpdir(), `knowbee-ocr-${Date.now()}`)

      const { base64 } = await captureScreenViaYeonjang({ options: yeonjangOptions })
      writeFileSync(tmpPng, Buffer.from(base64, "base64"))

      const { execFile } = await import("node:child_process")
      const { promisify } = await import("node:util")
      const execFileAsync = promisify(execFile)
      await execFileAsync("tesseract", [tmpPng, tmpTxt, "-l", "eng+kor"])
      const ocrText = readFileSync(`${tmpTxt}.txt`, "utf8")

      try { unlinkSync(tmpPng) } catch { /* ignore */ }
      try { unlinkSync(`${tmpTxt}.txt`) } catch { /* ignore */ }

      const found = ocrText.toLowerCase().includes(params.text.toLowerCase())
      return {
        success: true,
        output: found
          ? `"${params.text}" 텍스트를 화면에서 찾았습니다.`
          : `"${params.text}" 텍스트를 화면에서 찾을 수 없습니다.`,
        details: {
          via: "yeonjang",
          ...buildYeonjangTargetResolutionDetails(reboundSelection),
        },
      }
    } catch (err) {
      if (isYeonjangUnavailableError(err)) {
        const failure = yeonjangRequiredFailure("screen.capture")
        return {
          ...failure,
          details: {
            ...(failure.details && typeof failure.details === "object" ? failure.details as Record<string, unknown> : {}),
            ...buildYeonjangTargetResolutionDetails(selection),
          },
        }
      }
      return {
        success: false,
        output: `텍스트 검색 실패: ${err instanceof Error ? err.message : String(err)}`,
        details: {
          via: "yeonjang",
          ...buildYeonjangTargetResolutionDetails(selection),
        },
      }
    }
  },
}
