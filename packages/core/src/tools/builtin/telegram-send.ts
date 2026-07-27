import { existsSync, statSync } from "node:fs"
import { extname, resolve } from "node:path"
import { homedir } from "node:os"
import type { AgentTool, ArtifactDeliveryResultDetails, ToolContext, ToolResult } from "../types.js"
import type { SecurityConfig } from "../../config/types.js"
import { toolUserFacingErrorMessage } from "./error-redaction.js"
import { resolveArtifactReference } from "../../artifacts/lifecycle.js"

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
const DOCUMENT_LIKE_EXTENSIONS = new Set([
  ".txt",
  ".text",
  ".md",
  ".markdown",
  ".json",
  ".jsonl",
  ".csv",
  ".tsv",
  ".log",
  ".yaml",
  ".yml",
  ".xml",
  ".html",
  ".htm",
  ".rtf",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
])
const EXPLICIT_FILE_DELIVERY_PATTERNS = [
  /\b(file|document|attachment|attach|download|export|report file)\b/i,
  /\b(txt|text|markdown|md|json|csv|tsv|log|yaml|yml|xml|html|pdf|doc|docx|xls|xlsx)\b/i,
  /(?:파일|문서|첨부|첨부파일|다운로드|내보내|내보내기|보고서\s*파일|텍스트\s*파일|로그\s*파일|파일로)/u,
]
type FileDeliverySecurityConfig = Pick<SecurityConfig, "allowedPaths">
const DEFAULT_FILE_DELIVERY_SECURITY: FileDeliverySecurityConfig = Object.freeze({ allowedPaths: [] })

function assertAllowedPath(
  filePath: string,
  securityConfig: FileDeliverySecurityConfig = DEFAULT_FILE_DELIVERY_SECURITY,
): void {
  const resolved = resolve(filePath)
  const home = homedir()

  const allowed = securityConfig.allowedPaths.length > 0
    ? securityConfig.allowedPaths.map((p) => resolve(p.replace("~", home)))
    : [home]

  const isAllowed = allowed.some((a) => resolved.startsWith(a + "/") || resolved === a)
  if (!isAllowed) {
    throw new Error(
      `Access denied: "${resolved}" is outside the allowed paths.\n` +
      `Allowed: ${allowed.join(", ")}`,
    )
  }

  const denied = ["/System", "/usr", "/bin", "/sbin", "/etc", "/boot", "/sys", "C:\\Windows"]
  if (denied.some((d) => resolved.startsWith(d))) {
    throw new Error(`Access denied: "${resolved}" is a protected system path`)
  }
}

interface TelegramSendFileParams {
  filePath?: string
  artifactRef?: string
  caption?: string | undefined
}

function isDocumentLikeAttachment(filePath: string): boolean {
  return DOCUMENT_LIKE_EXTENSIONS.has(extname(filePath).toLowerCase())
}

function wantsExplicitFileDelivery(userMessage: string): boolean {
  return EXPLICIT_FILE_DELIVERY_PATTERNS.some((pattern) => pattern.test(userMessage))
}

export const telegramSendFileTool: AgentTool<TelegramSendFileParams> = {
  name: "telegram_send_file",
  description:
    "Send a file to the user via Telegram. " +
    "Supports documents, images, and other files up to 50MB. " +
    "Use this when you want to send a file result to the user.",
  parameters: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Absolute path to the file to send",
      },
      artifactRef: {
        type: "string",
        description: "Opaque artifact reference produced by a prior Tool result in this run",
      },
      caption: {
        type: "string",
        description: "Optional caption to display with the file",
      },
    },
    required: [],
  },
  riskLevel: "moderate",
  requiresApproval: true,
  availableSources: ["telegram"],

  async execute(params, ctx: ToolContext): Promise<ToolResult> {
    try {
      if (ctx.source !== "telegram") {
        return {
          success: false,
          output: "telegram_send_file 도구는 Telegram 채널에서만 사용할 수 있습니다.",
          error: "TELEGRAM_CHANNEL_REQUIRED",
        }
      }

      const resolvedArtifact = params.artifactRef?.trim()
        ? resolveArtifactReference({
            artifactRef: params.artifactRef,
            runId: ctx.runId,
            ...(ctx.requestGroupId ? { requestGroupId: ctx.requestGroupId } : {}),
          }, ctx.artifactStorage)
        : null
      if (resolvedArtifact && !resolvedArtifact.ok) {
        return {
          success: false,
          output: "요청한 artifact를 현재 실행 범위에서 확인할 수 없습니다.",
          error: `ARTIFACT_REF_${resolvedArtifact.reason.toUpperCase()}`,
        }
      }
      const filePath = resolvedArtifact?.ok
        ? resolvedArtifact.filePath
        : params.filePath?.replace(/^~/, homedir())
      if (!filePath) {
        return {
          success: false,
          output: "전달할 artifact reference 또는 파일 경로가 필요합니다.",
          error: "ARTIFACT_TARGET_REQUIRED",
        }
      }

      assertAllowedPath(filePath, ctx.securityConfig)

      if (!existsSync(filePath)) {
        return {
          success: false,
          output: `File not found: "${filePath}"`,
          error: "ENOENT",
        }
      }

      const stat = statSync(filePath)

      if (!stat.isFile()) {
        return {
          success: false,
          output: `"${filePath}" is not a file`,
          error: "EISDIR",
        }
      }

      if (stat.size > MAX_FILE_SIZE) {
        return {
          success: false,
          output: `File is too large: ${stat.size} bytes (max 50MB)`,
          error: "FILE_TOO_LARGE",
        }
      }

      if (isDocumentLikeAttachment(filePath) && !wantsExplicitFileDelivery(ctx.userMessage)) {
        return {
          success: false,
          output: "단순 확인/요약/상태 결과는 파일 첨부가 아니라 일반 메시지로 전달해야 합니다. 파일 또는 문서 첨부를 명시적으로 요청한 경우에만 telegram_send_file을 사용하세요.",
          error: "DOCUMENT_ATTACHMENT_NOT_REQUESTED",
        }
      }

      const details: ArtifactDeliveryResultDetails = {
        kind: "artifact_delivery",
        channel: "telegram",
        ...(resolvedArtifact?.ok
          ? { artifactRef: resolvedArtifact.artifactRef }
          : { filePath }),
        size: stat.size,
        source: ctx.source,
        ...(resolvedArtifact?.ok ? { mimeType: resolvedArtifact.mimeType } : {}),
        ...(params.caption ? { caption: params.caption } : {}),
      }

      return {
        success: true,
        output: "텔레그램 파일 전송 요청을 생성했습니다.",
        details,
      }
    } catch (err) {
      const msg = toolUserFacingErrorMessage(err)
      return { success: false, output: `Error preparing file: ${msg}`, error: msg }
    }
  },
}
