/**
 * Screen capture tools.
 * Uses @nut-tree/nut-js when available, falls back to platform CLI tools.
 */
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { DEFAULT_YEONJANG_EXTENSION_ID, isYeonjangUnavailableError, } from "../../../yeonjang/mqtt-client.js";
import { buildYeonjangTargetParameterProperties, buildYeonjangTargetResolutionDetails, buildYeonjangTargetSelectionFailure, recordYeonjangRemoteExecutionApproval, revalidateYeonjangTargetSelection, resolveYeonjangTargetSelection, } from "../yeonjang-target.js";
import { withYeonjangRequestMetadata } from "../yeonjang-request-metadata.js";
import { captureScreenViaYeonjang, classifyYeonjangScreenCaptureFailure, preflightYeonjangScreenCapture, saveInlineScreenCapture, statArtifactSize, yeonjangRequiredFailure, } from "./yeonjang-screen-shared.js";
import { toolUserFacingErrorMessage } from "../error-redaction.js";
import { resolveLocalOrYeonjangEvidenceSourceKind } from "../../evidence-source.js";
function resolveRequestedDisplay(display, userMessage) {
    if (typeof display === "number" && Number.isInteger(display) && display >= 0)
        return display;
    if (typeof display === "string") {
        const trimmed = display.trim().toLowerCase();
        if (/^\d+$/.test(trimmed))
            return Number.parseInt(trimmed, 10);
        if (trimmed === "main" || trimmed === "primary")
            return 0;
        if (trimmed === "secondary" || trimmed === "external")
            return 1;
    }
    const trimmedMessage = userMessage.trim();
    const koreanOrdinal = trimmedMessage.match(/(\d+)\s*(?:번째|번)\s*(?:모니터|디스플레이|화면)/u);
    if (koreanOrdinal) {
        const ordinal = Number.parseInt(koreanOrdinal[1] ?? "", 10);
        if (Number.isInteger(ordinal) && ordinal > 0)
            return ordinal - 1;
    }
    const englishOrdinal = trimmedMessage.match(/\b(\d+)(?:st|nd|rd|th)?\s+(?:monitor|display|screen)\b/i);
    if (englishOrdinal) {
        const ordinal = Number.parseInt(englishOrdinal[1] ?? "", 10);
        if (Number.isInteger(ordinal) && ordinal > 0)
            return ordinal - 1;
    }
    if (/(외부\s*모니터|서브\s*모니터|보조\s*모니터|두\s*번째\s*모니터|두번째\s*모니터)/u.test(trimmedMessage))
        return 1;
    if (/\b(?:second|secondary|external)\s+(?:monitor|display|screen)\b/i.test(trimmedMessage))
        return 1;
    if (/(메인\s*모니터|주\s*모니터|기본\s*모니터)/u.test(trimmedMessage))
        return 0;
    if (/\b(?:main|primary)\s+(?:monitor|display|screen)\b/i.test(trimmedMessage))
        return 0;
    return undefined;
}
function hashUtf8(value) {
    return createHash("sha256").update(value, "utf8").digest("hex");
}
function screenExtensionTarget(params) {
    const extensionId = params.extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID;
    const sessionId = params.targetSessionId?.trim();
    return sessionId ? `${extensionId}#${sessionId}` : extensionId;
}
function screenDisplayRef(params, ctx) {
    return `${resolveRequestedDisplay(params.display, ctx.userMessage) ?? "default"}`;
}
function screenCaptureTargetRef(params, ctx) {
    return `yeonjang:${screenExtensionTarget(params)}:screen:${screenDisplayRef(params, ctx)}`;
}
function screenCaptureExpectedState(params, ctx) {
    return {
        artifact: "local_saved",
        display: screenDisplayRef(params, ctx),
        minBytes: 1,
    };
}
async function observeScreenCapture(params, ctx, result) {
    const expectedState = screenCaptureExpectedState(params, ctx);
    const details = result.details && typeof result.details === "object" ? result.details : {};
    const bytes = typeof details.localFileSize === "number" ? details.localFileSize : 0;
    return {
        available: result.success && bytes >= 1,
        targetRef: screenCaptureTargetRef(params, ctx),
        expectedState,
        observedState: result.success && bytes >= 1
            ? expectedState
            : {
                artifact: "missing_or_empty",
                reason: result.error ?? "screen_capture_not_verified",
            },
    };
}
function screenFindTextTargetRef(params) {
    return `yeonjang:${screenExtensionTarget(params)}:screen:ocr:${hashUtf8(params.text)}`;
}
function screenFindTextExpectedState(params) {
    return {
        ocrChecked: true,
        textHash: hashUtf8(params.text),
    };
}
async function observeScreenFindText(params, _ctx, result) {
    return {
        available: result.success,
        targetRef: screenFindTextTargetRef(params),
        expectedState: screenFindTextExpectedState(params),
        observedState: result.success
            ? screenFindTextExpectedState(params)
            : {
                ocrChecked: false,
                reason: result.error ?? "screen_ocr_not_verified",
            },
    };
}
export const screenCaptureTool = {
    name: "screen_capture",
    resolveEvidenceSourceKind: resolveLocalOrYeonjangEvidenceSourceKind,
    runtimeHealthMode: "additional",
    runtimeMethodIds: ["screen.capture"],
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
    riskLevel: "moderate",
    requiresApproval: true,
    sideEffect: {
        effectClass: "local_write",
        compensationSupport: "irreversible",
        targetRef: screenCaptureTargetRef,
        expectedState: screenCaptureExpectedState,
        observe: observeScreenCapture,
    },
    execute: async (params, ctx) => {
        const selection = resolveYeonjangTargetSelection({
            requestedExtensionId: params.extensionId,
            targetSelector: params.targetSelector,
            expectedTargetSessionId: params.targetSessionId,
            userMessage: ctx.userMessage,
        });
        if (!selection.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(selection),
            };
        }
        const extensionId = selection.extensionId;
        const yeonjangOptions = withYeonjangRequestMetadata(ctx, extensionId ? {
            extensionId,
            ...(selection.targetSessionId ? { metadata: { targetSessionId: selection.targetSessionId } } : {}),
        } : {});
        const display = resolveRequestedDisplay(params.display, ctx.userMessage);
        try {
            const preflightFailure = await preflightYeonjangScreenCapture(yeonjangOptions);
            if (preflightFailure) {
                return {
                    ...preflightFailure,
                    details: {
                        ...(preflightFailure.details && typeof preflightFailure.details === "object" ? preflightFailure.details : {}),
                        ...buildYeonjangTargetResolutionDetails(selection),
                    },
                };
            }
            const reboundSelection = revalidateYeonjangTargetSelection({ selection });
            if (!reboundSelection.ok) {
                return {
                    success: false,
                    ...buildYeonjangTargetSelectionFailure(reboundSelection),
                };
            }
            recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "screen.capture", ctx });
            {
                const { base64, remote } = await captureScreenViaYeonjang({
                    options: yeonjangOptions,
                    ...(display !== undefined ? { display } : {}),
                });
                const localSavedPath = saveInlineScreenCapture(base64, remote.mime_type, join(ctx.artifactStorage.rootDir, "screens"));
                const localFileSize = statArtifactSize(localSavedPath);
                const artifactChannel = ctx.source === "webui" || ctx.source === "telegram" || ctx.source === "slack"
                    ? ctx.source
                    : null;
                const artifactDetails = artifactChannel && localSavedPath
                    ? {
                        kind: "artifact_delivery",
                        channel: artifactChannel,
                        filePath: localSavedPath,
                        mimeType: remote.mime_type ?? "image/png",
                        size: localFileSize,
                        source: ctx.source,
                    }
                    : undefined;
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
                };
            }
        }
        catch (error) {
            if (!isYeonjangUnavailableError(error)) {
                const message = toolUserFacingErrorMessage(error);
                const classified = classifyYeonjangScreenCaptureFailure(error, message);
                return {
                    success: false,
                    output: classified.output,
                    error: classified.code,
                    details: {
                        ...classified.details,
                        ...(extensionId ? { extensionId } : {}),
                        ...buildYeonjangTargetResolutionDetails(selection),
                    },
                };
            }
        }
        const failure = yeonjangRequiredFailure("screen.capture");
        return {
            ...failure,
            details: {
                ...(failure.details && typeof failure.details === "object" ? failure.details : {}),
                ...buildYeonjangTargetResolutionDetails(selection),
            },
        };
    },
};
export const screenFindTextTool = {
    name: "screen_find_text",
    resolveEvidenceSourceKind: resolveLocalOrYeonjangEvidenceSourceKind,
    runtimeHealthMode: "additional",
    runtimeMethodIds: ["screen.capture"],
    description: "현재 화면에서 특정 텍스트의 위치를 찾습니다. OCR을 사용합니다 (tesseract 필요).",
    parameters: {
        type: "object",
        properties: {
            text: { type: "string", description: "찾을 텍스트" },
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
        },
        required: ["text"],
    },
    riskLevel: "moderate",
    requiresApproval: true,
    sideEffect: {
        effectClass: "local_write",
        compensationSupport: "irreversible",
        targetRef: screenFindTextTargetRef,
        expectedState: screenFindTextExpectedState,
        observe: observeScreenFindText,
    },
    execute: async (params, ctx) => {
        const selection = resolveYeonjangTargetSelection({
            requestedExtensionId: params.extensionId,
            targetSelector: params.targetSelector,
            expectedTargetSessionId: params.targetSessionId,
            userMessage: ctx.userMessage || params.text,
        });
        if (!selection.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(selection),
            };
        }
        const extensionId = selection.extensionId;
        try {
            const yeonjangOptions = withYeonjangRequestMetadata(ctx, extensionId ? {
                extensionId,
                ...(selection.targetSessionId ? { metadata: { targetSessionId: selection.targetSessionId } } : {}),
            } : {});
            const preflightFailure = await preflightYeonjangScreenCapture(yeonjangOptions);
            if (preflightFailure) {
                return {
                    ...preflightFailure,
                    details: {
                        ...(preflightFailure.details && typeof preflightFailure.details === "object" ? preflightFailure.details : {}),
                        ...buildYeonjangTargetResolutionDetails(selection),
                    },
                };
            }
            const reboundSelection = revalidateYeonjangTargetSelection({ selection });
            if (!reboundSelection.ok) {
                return {
                    success: false,
                    ...buildYeonjangTargetSelectionFailure(reboundSelection),
                };
            }
            recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "screen.capture", ctx });
            const tmpPng = join(tmpdir(), `knowbee-screen-ocr-${Date.now()}.png`);
            const tmpTxt = join(tmpdir(), `knowbee-ocr-${Date.now()}`);
            const { base64 } = await captureScreenViaYeonjang({ options: yeonjangOptions });
            writeFileSync(tmpPng, Buffer.from(base64, "base64"));
            const { execFile } = await import("node:child_process");
            const { promisify } = await import("node:util");
            const execFileAsync = promisify(execFile);
            await execFileAsync("tesseract", [tmpPng, tmpTxt, "-l", "eng+kor"]);
            const ocrText = readFileSync(`${tmpTxt}.txt`, "utf8");
            try {
                unlinkSync(tmpPng);
            }
            catch { /* ignore */ }
            try {
                unlinkSync(`${tmpTxt}.txt`);
            }
            catch { /* ignore */ }
            const found = ocrText.toLowerCase().includes(params.text.toLowerCase());
            return {
                success: true,
                output: found
                    ? `"${params.text}" 텍스트를 화면에서 찾았습니다.`
                    : `"${params.text}" 텍스트를 화면에서 찾을 수 없습니다.`,
                details: {
                    via: "yeonjang",
                    found,
                    textHash: hashUtf8(params.text),
                    ...buildYeonjangTargetResolutionDetails(reboundSelection),
                },
            };
        }
        catch (err) {
            if (isYeonjangUnavailableError(err)) {
                const failure = yeonjangRequiredFailure("screen.capture");
                return {
                    ...failure,
                    details: {
                        ...(failure.details && typeof failure.details === "object" ? failure.details : {}),
                        ...buildYeonjangTargetResolutionDetails(selection),
                    },
                };
            }
            return {
                success: false,
                output: `텍스트 검색 실패: ${toolUserFacingErrorMessage(err)}`,
                details: {
                    via: "yeonjang",
                    ...buildYeonjangTargetResolutionDetails(selection),
                },
            };
        }
    },
};
//# sourceMappingURL=screen.js.map