import { createHash } from "node:crypto";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { invokeYeonjangMethod, DEFAULT_YEONJANG_EXTENSION_ID } from "../../yeonjang/mqtt-client.js";
import { hashYeonjangBrowserFocusExecutionTarget, } from "../../capabilities/yeonjang-browser-focus-execution-admission-issuer.js";
import { buildYeonjangBrowserFocusCommandContract, evaluateYeonjangBrowserFocusPostCheck, evaluateYeonjangBrowserFocusPreflight, evaluateYeonjangBrowserFocusToolAdmission, projectYeonjangBrowserFocusTarget, } from "../../capabilities/yeonjang-browser-focus-contract.js";
import { buildYeonjangTargetParameterProperties, buildYeonjangTargetResolutionDetails, buildYeonjangTargetSelectionFailure, recordYeonjangRemoteExecutionApproval, revalidateYeonjangTargetSelection, resolveYeonjangTargetSelection, } from "./yeonjang-target.js";
import { withYeonjangRequestMetadata } from "./yeonjang-request-metadata.js";
import { toolUserFacingErrorMessage } from "./error-redaction.js";
import { buildYeonjangEvidenceFromMapping } from "../../yeonjang/evidence.js";
import { YEONJANG_TOOL_MAPPINGS } from "../../yeonjang/tool-mapping.js";
import { createYeonjangBrowserFocusSideEffect } from "./yeonjang-browser-focus-side-effect.js";
import { recordArtifactMetadata, resolveArtifactReference } from "../../artifacts/lifecycle.js";
const yeonjangToolMappingByName = new Map(YEONJANG_TOOL_MAPPINGS.map((mapping) => [mapping.toolName, mapping]));
function yeonjangMapping(toolName) {
    const mapping = yeonjangToolMappingByName.get(toolName);
    if (!mapping)
        throw new Error(`missing Yeonjang tool mapping: ${toolName}`);
    return mapping;
}
function hashUtf8(value) {
    return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}
function yeonjangFileTargetRef(params) {
    const extensionId = params.extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID;
    const sessionRef = params.targetSessionId?.trim();
    return `yeonjang:${extensionId}${sessionRef ? `:${sessionRef}` : ""}:file:${params.path}`;
}
function readResultPostCheck(result) {
    if (!result.details || typeof result.details !== "object" || Array.isArray(result.details)) {
        return undefined;
    }
    const file = result.details.file;
    if (!file || typeof file !== "object" || Array.isArray(file))
        return undefined;
    const postCheck = file.postCheck;
    if (!postCheck || typeof postCheck !== "object" || Array.isArray(postCheck))
        return undefined;
    return postCheck;
}
function observeYeonjangFilePostCheck(params, expectedState, result) {
    const postCheck = readResultPostCheck(result);
    const observedState = postCheck?.verified === true && hasBytesExpectation(expectedState)
        ? {
            exists: postCheck.exists === true,
            ...(typeof postCheck.bytes === "number" ? { bytes: postCheck.bytes } : {}),
        }
        : postCheck?.verified === true
            ? expectedState
            : { reason: postCheck?.reason ?? "post_check_missing" };
    return {
        available: postCheck?.verified === true,
        targetRef: yeonjangFileTargetRef(params),
        expectedState,
        observedState,
    };
}
function hasBytesExpectation(value) {
    return (value != null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof value.bytes === "number");
}
function yeonjangClipboardTargetRef(params) {
    const extensionId = params.extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID;
    const sessionRef = params.targetSessionId?.trim();
    return `yeonjang:${extensionId}${sessionRef ? `:${sessionRef}` : ""}:clipboard`;
}
function yeonjangBrowserTargetRef(params) {
    const extensionId = params.extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID;
    const sessionRef = params.targetSessionId?.trim();
    return `yeonjang:${extensionId}${sessionRef ? `:${sessionRef}` : ""}:browser`;
}
function browserOpenUrlExpectedState(url) {
    const normalized = url.trim();
    return {
        urlHash: hashUtf8(normalized),
        urlLength: normalized.length,
        expectedAction: "open_url",
    };
}
function observeYeonjangBrowserOpenUrl(params, result) {
    const expectedState = browserOpenUrlExpectedState(params.url);
    const details = result.details && typeof result.details === "object" && !Array.isArray(result.details)
        ? result.details
        : {};
    const browser = details.browser && typeof details.browser === "object" && !Array.isArray(details.browser)
        ? details.browser
        : {};
    return {
        available: browser.postCheckReason === "llm_goal_validation_required",
        targetRef: yeonjangBrowserTargetRef(params),
        expectedState,
        observedState: {
            opened: browser.opened === true,
            urlScheme: typeof browser.urlScheme === "string" ? browser.urlScheme : "unknown",
            postCheckReason: typeof browser.postCheckReason === "string"
                ? browser.postCheckReason
                : "llm_goal_validation_required",
        },
    };
}
function clipboardWriteExpectedState(text) {
    return {
        contentHash: hashUtf8(text),
        bytes: Buffer.byteLength(text, "utf8"),
    };
}
function readClipboardWritePostCheck(result) {
    if (!result.details || typeof result.details !== "object" || Array.isArray(result.details)) {
        return undefined;
    }
    const clipboard = result.details.clipboard;
    if (!clipboard || typeof clipboard !== "object" || Array.isArray(clipboard))
        return undefined;
    const postCheck = clipboard.postCheck;
    if (!postCheck || typeof postCheck !== "object" || Array.isArray(postCheck))
        return undefined;
    return postCheck;
}
function observeYeonjangClipboardWrite(params, result) {
    const expectedState = clipboardWriteExpectedState(params.text);
    const postCheck = readClipboardWritePostCheck(result);
    const observedState = postCheck?.verified === true
        ? {
            contentHash: postCheck.contentHash ?? "",
            bytes: postCheck.byteLength ?? 0,
        }
        : { reason: postCheck?.reason ?? "post_check_missing" };
    return {
        available: postCheck?.verified === true,
        targetRef: yeonjangClipboardTargetRef(params),
        expectedState,
        observedState,
    };
}
function yeonjangCameraTargetRef(params) {
    const extensionId = params.extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID;
    const sessionRef = params.targetSessionId?.trim();
    const deviceRef = params.deviceId?.trim() || "default";
    return `yeonjang:${extensionId}${sessionRef ? `:${sessionRef}` : ""}:camera:${deviceRef}`;
}
function canonicalYeonjangCameraOperation(params) {
    const extensionId = params.extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID;
    const targetSessionId = params.targetSessionId?.trim();
    const deviceId = params.deviceId?.trim();
    return {
        extensionId,
        ...(targetSessionId ? { targetSessionId } : {}),
        ...(params.targetSelector ? { targetSelector: params.targetSelector } : {}),
        ...(deviceId ? { deviceId } : {}),
        // A facing is enforceable only when an exact device was selected from a
        // typed camera inventory. It is not a substitute for the default-device
        // protocol target and must not create an approval binding the command
        // cannot actually enforce.
        ...(deviceId && params.requestedFacing
            ? { requestedFacing: params.requestedFacing }
            : {}),
    };
}
function prepareYeonjangCameraOperation(params, _ctx) {
    const selection = resolveYeonjangTargetSelection({
        requestedExtensionId: params.extensionId,
        targetSelector: params.targetSelector,
        expectedTargetSessionId: params.targetSessionId,
    });
    if (!selection.ok) {
        return {
            status: "rejected",
            result: {
                success: false,
                ...buildYeonjangTargetSelectionFailure(selection),
            },
        };
    }
    const executionParams = {
        ...(params.deviceId ? { deviceId: params.deviceId } : {}),
        ...(params.deviceId && params.requestedFacing
            ? { requestedFacing: params.requestedFacing }
            : {}),
        ...(params.timeoutSec != null ? { timeoutSec: params.timeoutSec } : {}),
        extensionId: selection.extensionId ?? DEFAULT_YEONJANG_EXTENSION_ID,
        ...(selection.targetSessionId
            ? { targetSessionId: selection.targetSessionId }
            : {}),
    };
    return {
        status: "prepared",
        executionParams,
        targetRef: yeonjangCameraTargetRef(executionParams),
        effectParams: {
            ...(executionParams.deviceId ? { deviceId: executionParams.deviceId } : {}),
            ...(executionParams.requestedFacing
                ? { requestedFacing: executionParams.requestedFacing }
                : {}),
        },
        expectedState: cameraExpectedState(executionParams),
    };
}
function cameraExpectedState(params) {
    const deviceId = params.deviceId?.trim();
    return {
        artifact: "local_saved",
        requestedDevice: deviceId
            ? { kind: "exact", deviceId }
            : { kind: "any_resolved_device" },
        minBytes: 1,
    };
}
function cameraObservedState(input) {
    if (input.expectedState.requestedDevice.kind === "exact") {
        if (!input.resolvedDeviceId)
            return { reason: "camera_resolved_device_missing" };
        if (input.expectedState.requestedDevice.deviceId !== input.resolvedDeviceId) {
            return { reason: "camera_resolved_device_mismatch" };
        }
    }
    return input.expectedState;
}
function observeYeonjangCameraCapture(params, result) {
    const expectedState = cameraExpectedState(params);
    const details = result.details && typeof result.details === "object" && !Array.isArray(result.details)
        ? result.details
        : {};
    const localFileSize = typeof details.localFileSize === "number" ? details.localFileSize : 0;
    const resolvedDeviceId = typeof details.deviceId === "string" ? details.deviceId.trim() : "";
    const observedState = result.success && localFileSize >= expectedState.minBytes
        ? cameraObservedState({ expectedState, resolvedDeviceId })
        : { reason: "camera_artifact_missing_or_empty" };
    const recoveryEvidence = cameraRecoveryEvidence({
        result,
        observedState,
        resolvedDevicePresent: resolvedDeviceId.length > 0,
    });
    return {
        available: result.success === true &&
            localFileSize >= expectedState.minBytes &&
            !("reason" in observedState),
        targetRef: yeonjangCameraTargetRef(params),
        expectedState,
        observedState,
        ...(recoveryEvidence ? { recoveryEvidence } : {}),
    };
}
const SUPPORTED_CAMERA_ARTIFACT_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);
const CAMERA_DEVICE_CONSTRAINT_SATISFIED_REF = "side-effect-fact:camera-device-constraint-satisfied:v1";
function cameraRecoveryEvidence(input) {
    if (!("reason" in input.observedState))
        return undefined;
    if (input.observedState.reason !== "camera_resolved_device_missing" &&
        input.observedState.reason !== "camera_resolved_device_mismatch") {
        return undefined;
    }
    const details = input.result.details && typeof input.result.details === "object" &&
        !Array.isArray(input.result.details)
        ? input.result.details
        : {};
    const verification = details.artifactVerification &&
        typeof details.artifactVerification === "object" &&
        !Array.isArray(details.artifactVerification)
        ? details.artifactVerification
        : {};
    if (verification.status !== "verified" ||
        typeof verification.artifactRef !== "string" ||
        !/^artifact:[0-9a-f-]{36}$/iu.test(verification.artifactRef) ||
        typeof verification.mimeType !== "string" ||
        !SUPPORTED_CAMERA_ARTIFACT_MIME_TYPES.has(verification.mimeType) ||
        typeof verification.sizeBytes !== "number" ||
        !Number.isSafeInteger(verification.sizeBytes) ||
        verification.sizeBytes <= 0) {
        return undefined;
    }
    return {
        kind: "artifact_candidate",
        artifactRef: verification.artifactRef,
        mimeType: verification.mimeType,
        sizeBytes: verification.sizeBytes,
        reasonCode: input.observedState.reason,
        resolvedDevicePresent: input.resolvedDevicePresent,
    };
}
function cameraEffectEvidenceRefs(params, result) {
    const details = result.details && typeof result.details === "object" && !Array.isArray(result.details)
        ? result.details
        : {};
    const verification = details.artifactVerification &&
        typeof details.artifactVerification === "object" &&
        !Array.isArray(details.artifactVerification)
        ? details.artifactVerification
        : {};
    const artifactRef = verification.status === "verified" &&
        typeof verification.artifactRef === "string" &&
        /^artifact:[0-9a-f-]{36}$/iu.test(verification.artifactRef)
        ? verification.artifactRef
        : undefined;
    if (!artifactRef)
        return [];
    const expectedState = cameraExpectedState(params);
    const resolvedDeviceId = typeof details.deviceId === "string" ? details.deviceId.trim() : "";
    const observedState = cameraObservedState({ expectedState, resolvedDeviceId });
    return observedState === expectedState && expectedState.requestedDevice.kind === "exact"
        ? [artifactRef, CAMERA_DEVICE_CONSTRAINT_SATISFIED_REF]
        : [artifactRef];
}
async function observeCurrentYeonjangCameraCapture(params, ctx, effectEvidenceRefs) {
    const expectedState = cameraExpectedState(params);
    const artifactRefs = effectEvidenceRefs.filter((ref) => /^artifact:[0-9a-f-]{36}$/iu.test(ref));
    const deviceConstraintSatisfied = effectEvidenceRefs.includes(CAMERA_DEVICE_CONSTRAINT_SATISFIED_REF);
    const artifactResolution = artifactRefs.length === 1
        ? resolveArtifactReference({
            artifactRef: artifactRefs[0],
            runId: ctx.runId,
            requestGroupId: ctx.requestGroupId ?? ctx.runId,
        }, ctx.artifactStorage)
        : undefined;
    let artifactAvailable = false;
    if (artifactResolution?.ok &&
        artifactResolution.sizeBytes > 0 &&
        SUPPORTED_CAMERA_ARTIFACT_MIME_TYPES.has(artifactResolution.mimeType)) {
        try {
            const stat = ctx.artifactStorage.fileSystem.stat(artifactResolution.filePath);
            artifactAvailable =
                ctx.artifactStorage.fileSystem.exists(artifactResolution.filePath) &&
                    stat.isFile() &&
                    stat.size > 0;
        }
        catch {
            artifactAvailable = false;
        }
    }
    const requiresDeviceConstraint = expectedState.requestedDevice.kind === "exact";
    const available = artifactAvailable && (!requiresDeviceConstraint || deviceConstraintSatisfied);
    const recoveryEvidence = requiresDeviceConstraint && artifactResolution?.ok && artifactAvailable && !deviceConstraintSatisfied
        ? {
            kind: "artifact_candidate",
            artifactRef: artifactResolution.artifactRef,
            mimeType: artifactResolution.mimeType,
            sizeBytes: artifactResolution.sizeBytes,
            reasonCode: "camera_device_constraint_evidence_missing",
            resolvedDevicePresent: false,
        }
        : undefined;
    return {
        available,
        targetRef: yeonjangCameraTargetRef(params),
        expectedState,
        observedState: available
            ? expectedState
            : {
                reason: artifactAvailable
                    ? "camera_device_constraint_evidence_missing"
                    : "camera_artifact_resume_evidence_invalid",
            },
        ...(recoveryEvidence ? { recoveryEvidence } : {}),
    };
}
function validateYeonjangBinaryCaptureResult(result) {
    if (!result.base64_data) {
        return {
            ok: false,
            errorCode: "CAMERA_ARTIFACT_BYTES_MISSING",
            reasonCode: "camera_artifact_bytes_missing",
            message: "연장 camera.capture 응답에 이미지 데이터가 없습니다.",
        };
    }
    if (result.transfer_encoding && result.transfer_encoding !== "base64") {
        return {
            ok: false,
            errorCode: "CAMERA_ARTIFACT_ENCODING_INVALID",
            reasonCode: "camera_artifact_encoding_invalid",
            message: "연장 camera.capture 응답의 이미지 전달 형식이 올바르지 않습니다.",
        };
    }
    const mimeType = result.mime_type?.trim().toLowerCase() ?? "";
    if (!SUPPORTED_CAMERA_ARTIFACT_MIME_TYPES.has(mimeType)) {
        return {
            ok: false,
            errorCode: "CAMERA_ARTIFACT_MIME_INVALID",
            reasonCode: "camera_artifact_mime_invalid",
            message: "연장 camera.capture 응답의 이미지 MIME 유형을 검증할 수 없습니다.",
        };
    }
    const bytes = Buffer.from(result.base64_data, "base64");
    if (bytes.length === 0) {
        return {
            ok: false,
            errorCode: "CAMERA_ARTIFACT_EMPTY",
            reasonCode: "camera_artifact_empty",
            message: "연장 camera.capture 응답의 이미지가 비어 있습니다.",
        };
    }
    return { ok: true, bytes, mimeType };
}
function cameraDeviceFacing(device) {
    const position = device.position?.trim().toLowerCase();
    if (position === "front")
        return "front";
    if (position === "rear" || position === "back")
        return "rear";
    return null;
}
function findCameraDeviceById(devices, deviceId) {
    if (!deviceId)
        return null;
    return devices.find((device) => device.id === deviceId) ?? null;
}
function buildCameraFacingUnsupportedMessage(params) {
    const facingLabel = params.facing === "front" ? "전면" : "후면";
    return [
        `선택한 카메라 "${params.deviceName}" 에서는 ${facingLabel} 카메라를 Knowbee/Yeonjang에서 강제로 선택할 수 없습니다.`,
        "iPhone 연속성 카메라는 현재 렌즈(전면/후면) 전환 제어를 노출하지 않습니다.",
        `iPhone에서 ${facingLabel} 카메라로 직접 전환한 뒤 다시 촬영하거나, 다른 카메라를 선택해 주세요.`,
    ].join("\n");
}
function buildCameraFacingCapabilityUnknownMessage(params) {
    const facingLabel = params.facing === "front" ? "전면" : "후면";
    return [
        `선택한 카메라 "${params.deviceName}"의 ${facingLabel} 카메라 선택 지원 여부를 확인할 수 없습니다.`,
        "카메라 목록의 position capability를 확인하거나, facing 조건 없이 다시 요청해 주세요.",
    ].join("\n");
}
function resolveTimeoutMs(timeoutSec) {
    if (!Number.isFinite(timeoutSec))
        return undefined;
    return Math.max(1, Math.min(60, Math.floor(timeoutSec))) * 1000;
}
const DEFAULT_CAMERA_CAPTURE_OPERATION_BUDGET_MS = 60_000;
const CAMERA_CAPTURE_TRANSPORT_GRACE_MS = 10_000;
function resolveCameraCaptureOperationBudgetMs(timeoutSec) {
    return resolveTimeoutMs(timeoutSec) ?? DEFAULT_CAMERA_CAPTURE_OPERATION_BUDGET_MS;
}
function cameraCaptureTransportTimeoutMs(operationBudgetMs) {
    return operationBudgetMs + CAMERA_CAPTURE_TRANSPORT_GRACE_MS;
}
const CAMERA_CAPTURE_RUNTIME_FAILURES = Object.freeze({
    camera_response_timeout: "CAMERA_RESPONSE_TIMEOUT",
    camera_handler_timeout: "CAMERA_HANDLER_TIMEOUT",
    camera_helper_timeout: "CAMERA_HELPER_TIMEOUT",
    camera_capture_timeout: "CAMERA_CAPTURE_TIMEOUT",
    camera_busy: "CAMERA_BUSY",
    camera_capture_cancelled: "CAMERA_CAPTURE_CANCELLED",
    camera_permission_denied: "CAMERA_PERMISSION_DENIED",
    camera_permission_restricted: "CAMERA_PERMISSION_RESTRICTED",
    camera_permission_not_determined: "CAMERA_PERMISSION_NOT_DETERMINED",
});
function cameraCaptureFailureProjection(error) {
    const code = error instanceof Error
        && typeof error.code === "string"
        ? error.code
        : "";
    const attempt = error instanceof Error
        && error.attempt
        && typeof error.attempt === "object"
        && !Array.isArray(error.attempt)
        ? error.attempt
        : null;
    const terminalStage = attempt?.terminalStage;
    const retrySafety = attempt?.retrySafety;
    const boundAttempt = attempt?.schemaVersion === 1
        && attempt.method === "camera.capture"
        && attempt.reasonCode === code;
    if (Object.hasOwn(CAMERA_CAPTURE_RUNTIME_FAILURES, code) || (code && boundAttempt)) {
        const reasonCode = code;
        return {
            errorCode: Object.hasOwn(CAMERA_CAPTURE_RUNTIME_FAILURES, code)
                ? CAMERA_CAPTURE_RUNTIME_FAILURES[reasonCode]
                : code,
            reasonCode,
            ...(boundAttempt
                && (terminalStage === "response_timeout"
                    || terminalStage === "handler_timeout"
                    || terminalStage === "helper_timeout"
                    || terminalStage === "handler_failed"
                    || terminalStage === "cancelled"
                    || terminalStage === "rejected")
                ? { terminalStage }
                : {}),
            ...(boundAttempt
                && (retrySafety === "safe_same_command"
                    || retrySafety === "change_strategy"
                    || retrySafety === "unknown_effect_state"
                    || retrySafety === "completed")
                ? { retrySafety }
                : {}),
        };
    }
    return { errorCode: "YEONJANG_CAMERA_CAPTURE_REMOTE_FAILURE" };
}
function formatCameraList(extensionId, devices) {
    if (devices.length === 0) {
        return `연장 "${extensionId}" 에서 사용 가능한 카메라를 찾지 못했습니다.`;
    }
    const lines = devices.map((device) => {
        const parts = [device.name];
        if (device.position)
            parts.push(device.position);
        parts.push(device.available ? "사용 가능" : "사용 불가");
        return `- ${parts.join(" · ")} (${device.id})`;
    });
    return `연장 "${extensionId}" 카메라 ${devices.length}개:\n${lines.join("\n")}`;
}
function formatCameraPermissionStatusOutput(extensionId, result) {
    return [
        `연장 "${extensionId}" 카메라 권한 상태: ${result.status}`,
        `reason=${result.reason}`,
        `platform=${result.platform}`,
        `캡처 시도 가능: ${result.canAttemptCapture ? "예" : "아니오"}`,
        `사용자 조치 필요: ${result.requiresUserAction ? "예" : "아니오"}`,
    ].join("\n");
}
function formatCaptureOutput(extensionId, result) {
    const lines = [`연장 "${extensionId}" 카메라 캡처 완료.`];
    if (result.device_id)
        lines.push(`장치: ${result.device_id}`);
    if (result.file_name)
        lines.push(`파일명: ${result.file_name}`);
    if (result.file_extension)
        lines.push(`확장자: ${result.file_extension}`);
    if (result.mime_type)
        lines.push(`유형: ${result.mime_type}`);
    if (typeof result.size_bytes === "number")
        lines.push(`크기: ${result.size_bytes} bytes`);
    if (result.transfer_encoding)
        lines.push(`전달 형식: ${result.transfer_encoding}`);
    if (result.base64_data) {
        lines.push(`인라인 이미지: ${Math.round(result.base64_data.length / 1024)}KB base64`);
    }
    if (result.message)
        lines.push(result.message);
    return lines.join("\n");
}
function formatFileMetadataOutput(extensionId, result) {
    const lines = [`연장 "${extensionId}" 파일 정보:`];
    lines.push(`경로: ${result.path}`);
    lines.push(`유형: ${result.kind}`);
    if (typeof result.bytes === "number")
        lines.push(`크기: ${result.bytes} bytes`);
    if (typeof result.readonly === "boolean")
        lines.push(`읽기 전용: ${result.readonly ? "예" : "아니오"}`);
    if (result.modifiedAt)
        lines.push(`수정 시각: ${result.modifiedAt}`);
    return lines.join("\n");
}
function formatFileListOutput(extensionId, result) {
    if (result.entries.length === 0) {
        return `연장 "${extensionId}" 경로에 표시할 항목이 없습니다.\n경로: ${result.path}`;
    }
    const lines = [`연장 "${extensionId}" 파일 목록: ${result.path}`];
    for (const entry of result.entries) {
        const parts = [entry.kind];
        if (typeof entry.bytes === "number")
            parts.push(`${entry.bytes} bytes`);
        if (entry.modifiedAt)
            parts.push(entry.modifiedAt);
        lines.push(`- ${entry.name} (${parts.join(" · ")})`);
    }
    return lines.join("\n");
}
function formatFileReadOutput(extensionId, result) {
    const header = [
        `연장 "${extensionId}" 파일 읽기 완료.`,
        `경로: ${result.path}`,
        `읽은 크기: ${result.bytesRead}/${result.totalBytes} bytes${result.truncated ? " (잘림)" : ""}`,
        "내용:",
    ].join("\n");
    return `${header}\n${result.text}`;
}
function formatFileSearchOutput(extensionId, result) {
    const lines = [`연장 "${extensionId}" 파일 검색: ${result.resultCount}개 일치`];
    lines.push(`경로: ${result.path}`);
    lines.push(`검색어: ${result.query}`);
    for (const match of result.matches.slice(0, 20)) {
        lines.push(`- ${match.path}:${match.lineNumber} ${match.preview}`);
    }
    if (result.skippedFiles > 0)
        lines.push(`건너뛴 파일: ${result.skippedFiles}개`);
    if (result.truncated || result.matches.length > 20)
        lines.push("검색 결과가 제한되었습니다.");
    return lines.join("\n");
}
function formatFileWriteOutput(extensionId, result) {
    return [
        `연장 "${extensionId}" 파일 쓰기 완료.`,
        `경로: ${result.path}`,
        `쓴 크기: ${result.bytesWritten} bytes`,
        `덮어쓰기: ${result.overwrite ? "예" : "아니오"}`,
        `사후검증: ${result.postCheck.verified ? "성공" : "실패"}`,
    ].join("\n");
}
function formatFilePatchOutput(extensionId, result) {
    return [
        `연장 "${extensionId}" 파일 패치 결과.`,
        `경로: ${result.path}`,
        `변경됨: ${result.changed ? "예" : "아니오"}`,
        `reason=${result.reason}`,
        `매칭 수: ${result.matchCount}`,
        `크기: ${result.bytesBefore} -> ${result.bytesAfter} bytes`,
        `사후검증: ${result.postCheck.verified ? "성공" : "실패"}`,
    ].join("\n");
}
function formatFileDeleteOutput(extensionId, result) {
    return [
        `연장 "${extensionId}" 파일 삭제 완료.`,
        `경로: ${result.path}`,
        `유형: ${result.kind}`,
        `삭제됨: ${result.deleted ? "예" : "아니오"}`,
        `사후검증: ${result.postCheck.verified ? "성공" : "실패"}`,
    ].join("\n");
}
function formatDiskInfoOutput(extensionId, result) {
    const lines = [`연장 "${extensionId}" 디스크 정보:`];
    lines.push(`경로: ${result.path}`);
    lines.push(`존재: ${result.exists ? "예" : "아니오"}`);
    if (result.kind)
        lines.push(`유형: ${result.kind}`);
    if (typeof result.readonly === "boolean")
        lines.push(`읽기 전용: ${result.readonly ? "예" : "아니오"}`);
    if (typeof result.totalBytes === "number")
        lines.push(`전체: ${result.totalBytes} bytes`);
    if (typeof result.freeBytes === "number")
        lines.push(`여유: ${result.freeBytes} bytes`);
    if (typeof result.availableBytes === "number")
        lines.push(`사용 가능: ${result.availableBytes} bytes`);
    return lines.join("\n");
}
function formatDiskUsageOutput(extensionId, result) {
    return [
        `연장 "${extensionId}" 디스크 사용량:`,
        `경로: ${result.path}`,
        `전체: ${result.totalBytes} bytes`,
        `여유: ${result.freeBytes} bytes`,
        `사용 가능: ${result.availableBytes} bytes`,
    ].join("\n");
}
function formatDiskExistsOutput(extensionId, result) {
    const lines = [`연장 "${extensionId}" 경로 존재 확인:`];
    lines.push(`경로: ${result.path}`);
    lines.push(`존재: ${result.exists ? "예" : "아니오"}`);
    if (result.kind)
        lines.push(`유형: ${result.kind}`);
    if (typeof result.readonly === "boolean")
        lines.push(`읽기 전용: ${result.readonly ? "예" : "아니오"}`);
    return lines.join("\n");
}
function formatProcessEntry(entry) {
    const parts = [`pid=${entry.pid}`, entry.status];
    if (typeof entry.memoryBytes === "number")
        parts.push(`${entry.memoryBytes} bytes`);
    if (typeof entry.cpuUsage === "number")
        parts.push(`${entry.cpuUsage.toFixed(1)}% cpu`);
    return `${entry.name} (${parts.join(" · ")})`;
}
function formatProcessListOutput(extensionId, result) {
    const lines = [`연장 "${extensionId}" 프로세스 목록: ${result.count}/${result.totalCount}개`];
    for (const entry of result.processes) {
        lines.push(`- ${formatProcessEntry(entry)}`);
    }
    if (result.truncated)
        lines.push(`목록이 ${result.limit}개로 제한되었습니다.`);
    return lines.join("\n");
}
function formatProcessInfoOutput(extensionId, result) {
    return [
        `연장 "${extensionId}" 프로세스 정보:`,
        formatProcessEntry(result.process),
        ...(typeof result.process.startedAt === "number" ? [`시작 시각: ${result.process.startedAt}`] : []),
    ].join("\n");
}
function formatBrowserCandidate(entry) {
    const parts = [`pid=${entry.pid}`, entry.running ? "running" : "not running", entry.confidence];
    if (entry.status)
        parts.push(entry.status);
    return `${entry.browser} · ${entry.appName} (${parts.join(" · ")})`;
}
function formatBrowserListOutput(extensionId, result) {
    if (result.browsers.length === 0) {
        return `연장 "${extensionId}" 에서 실행 중인 브라우저 후보를 찾지 못했습니다.`;
    }
    const lines = [`연장 "${extensionId}" 브라우저 후보: ${result.count}/${result.totalCount}개`];
    for (const entry of result.browsers) {
        lines.push(`- ${formatBrowserCandidate(entry)}`);
    }
    if (result.truncated)
        lines.push(`목록이 ${result.limit}개로 제한되었습니다.`);
    return lines.join("\n");
}
function formatBrowserActiveHintOutput(extensionId, result) {
    if (!result.available || !result.activeBrowser) {
        return `연장 "${extensionId}" 에서 활성 브라우저 후보를 찾지 못했습니다. reason=${result.reason}`;
    }
    return [
        `연장 "${extensionId}" 활성 브라우저 후보:`,
        formatBrowserCandidate(result.activeBrowser),
        `reason=${result.reason}`,
    ].join("\n");
}
function formatBrowserOpenUrlOutput(extensionId, result) {
    return [
        `연장 "${extensionId}" 브라우저 URL 열기 요청이 전달되었습니다.`,
        `scheme=${result.urlScheme}`,
        `사후검증: ${result.postCheck.verified ? "성공" : "LLM 목표 검증 필요"}`,
        ...(result.postCheck.reason ? [`reason=${result.postCheck.reason}`] : []),
    ].join("\n");
}
function formatBrowserFocusOutput(extensionId, result, postCheck) {
    const state = postCheck?.state ?? "MANUAL_INTERVENTION";
    const reasonCode = postCheck?.reasonCode ?? result.reasonCode ?? "focused_target_observation_required";
    return [
        `연장 "${extensionId}" 브라우저 포커스 요청이 준비되었습니다.`,
        `reason=${reasonCode}`,
        `사후검증: ${state === "VERIFIED" ? "성공" : "focused target observation 필요"}`,
    ].join("\n");
}
function browserFocusTarget(params) {
    const projected = projectYeonjangBrowserFocusTarget({
        targetAlias: params.targetAlias,
        processName: params.processName,
        title: params.title,
        url: params.url,
    });
    return projected.ok ? projected.projection : null;
}
function browserFocusTargetRef(params) {
    const extensionId = params.extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID;
    const sessionRef = params.targetSessionId?.trim();
    const target = browserFocusTarget(params);
    return `yeonjang:${extensionId}${sessionRef ? `:${sessionRef}` : ""}:browser.focus:${target?.displayName ?? "target"}`;
}
function hasExplicitBrowserFocusApproval(ctx) {
    const decision = ctx.authorizationReceipt?.approvalDecision;
    return decision === "allow_once" || decision === "allow_run";
}
function isBrowserFocusPublicTargetProjection(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
    const candidate = value;
    return (candidate.schemaVersion === "yeonjang-browser-focus-target-v1" &&
        candidate.targetKind === "browser_window_or_tab" &&
        typeof candidate.displayName === "string" &&
        Array.isArray(candidate.publicEvidenceFields) &&
        Array.isArray(candidate.auditOnlyFields));
}
function browserFocusExpectedState(params, ctx) {
    const target = browserFocusTarget(params);
    const fallbackTarget = target ?? {
        schemaVersion: "yeonjang-browser-focus-target-v1",
        targetKind: "browser_window_or_tab",
        displayName: "target_required",
        publicEvidenceFields: [],
        auditOnlyFields: [],
    };
    const approvalGranted = hasExplicitBrowserFocusApproval(ctx);
    const preflight = evaluateYeonjangBrowserFocusPreflight({
        capabilitySupported: true,
        approvalGranted,
        target: fallbackTarget,
    });
    const admission = evaluateYeonjangBrowserFocusToolAdmission({
        readyTargets: target
            ? [{
                    publicTargetName: target.displayName,
                    platform: "unknown",
                    method: "browser.focus",
                    requiresApproval: true,
                    permissionSetting: "allow_browser_control",
                }]
            : [],
        approvalGranted,
        preflight,
    });
    return {
        method: "browser.focus",
        target: fallbackTarget,
        commandContract: buildYeonjangBrowserFocusCommandContract({
            platform: "unknown",
            desktopSession: "available",
            commandBackendAvailable: Boolean(ctx.yeonjangBrowserFocusExecutionAdmissionIssuer),
            observationBackendAvailable: true,
            admission,
            target: fallbackTarget,
        }),
    };
}
function buildBrowserFocusPublicTargetResolutionDetails(selection) {
    return {
        selectionStatus: selection.status,
        explicitTarget: selection.explicitTarget,
        targetResolved: selection.ok,
        uiAction: selection.uiAction,
        reasonCodes: [...selection.reasonCodes],
    };
}
function formatClipboardReadOutput(extensionId, result) {
    if (result.empty)
        return `연장 "${extensionId}" 클립보드가 비어 있습니다.`;
    return [
        `연장 "${extensionId}" 클립보드 읽기 완료 (${result.charCount}자, ${result.byteLength} bytes).`,
        result.text,
    ].join("\n");
}
function formatClipboardWriteOutput(extensionId, result) {
    return [
        `연장 "${extensionId}" 클립보드 쓰기 ${result.postCheck.verified ? "완료" : "실패"}.`,
        `요청 크기: ${result.charCount}자, ${result.byteLength} bytes`,
        `사후검증: ${result.postCheck.verified ? "성공" : "실패"}`,
        ...(result.postCheck.reason ? [`이유: ${result.postCheck.reason}`] : []),
    ].join("\n");
}
function formatNetworkStatusOutput(extensionId, result) {
    const lines = [`연장 "${extensionId}" 네트워크 상태: ${result.interfaceCount}개 인터페이스`];
    for (const entry of result.interfaces.slice(0, 20)) {
        lines.push(`- ${entry.name}: received=${entry.totalReceivedBytes} bytes, transmitted=${entry.totalTransmittedBytes} bytes`);
    }
    lines.push(`외부 연결 검사: ${result.externalProbe ? "실행됨" : "실행 안 함"}`);
    if (result.interfaces.length > 20)
        lines.push("인터페이스 목록이 20개로 제한되었습니다.");
    return lines.join("\n");
}
function formatDeviceStatusOutput(extensionId, result) {
    const groups = Object.entries(result.resources)
        .map(([name, values]) => {
        const enabled = Object.values(values).filter((value) => value === true).length;
        return `${name}: ${enabled}/${Object.keys(values).length}`;
    });
    return [
        `연장 "${extensionId}" 장치 상태:`,
        `플랫폼: ${result.platform}`,
        ...groups.map((group) => `- ${group}`),
    ].join("\n");
}
function extensionFromMimeType(mimeType) {
    switch ((mimeType ?? "").toLowerCase()) {
        case "image/png":
            return "png";
        case "image/webp":
            return "webp";
        case "image/jpeg":
        case "image/jpg":
        default:
            return "jpg";
    }
}
function saveInlineCapture(extensionId, bytes, mimeType, artifactsRoot) {
    const artifactsDir = join(artifactsRoot, "yeonjang");
    mkdirSync(artifactsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = join(artifactsDir, `${extensionId}-camera-${timestamp}.${extensionFromMimeType(mimeType)}`);
    writeFileSync(filePath, bytes);
    return filePath;
}
export const yeonjangCameraListTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["camera.list"],
    name: "yeonjang_camera_list",
    description: "MQTT로 연결된 Yeonjang 연장에 카메라 목록 조회를 요청합니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: [],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params, ctx) {
        const selection = resolveYeonjangTargetSelection({
            requestedExtensionId: params.extensionId,
            targetSelector: params.targetSelector,
            expectedTargetSessionId: params.targetSessionId,
        });
        if (!selection.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(selection),
            };
        }
        const extensionId = selection.extensionId ?? DEFAULT_YEONJANG_EXTENSION_ID;
        const yeonjangOptions = withYeonjangRequestMetadata(ctx, {
            extensionId,
            ...(selection.targetSessionId ? { metadata: { targetSessionId: selection.targetSessionId } } : {}),
        });
        ctx.onProgress(`연장 ${extensionId} 카메라 목록을 조회합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const devices = await invokeYeonjangMethod("camera.list", {}, {
                ...yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: true,
                output: formatCameraList(extensionId, devices),
                details: {
                    via: "yeonjang",
                    extensionId,
                    devices,
                    ...buildYeonjangTargetResolutionDetails(selection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${extensionId}" 카메라 목록 조회 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId,
                    ...buildYeonjangTargetResolutionDetails(selection),
                },
            };
        }
    },
};
export const yeonjangCameraPermissionStatusTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    // Legacy Yeonjang advertises the diagnostic method directly. MQTT v2 keeps
    // the read-only permission query off the effect capability catalog, so its
    // authenticated camera.capture capability is the exact transport witness.
    runtimeMethodIds: ["camera.permission_status", "camera.capture"],
    name: "yeonjang_camera_permission_status",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 카메라 권한 상태를 진단합니다. 이미지는 캡처하지 않습니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: [],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        ctx.onProgress(`연장 ${resolved.extensionId} 카메라 권한 상태를 확인합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("camera.permission_status", {}, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: true,
                output: formatCameraPermissionStatusOutput(resolved.extensionId, result),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    cameraPermission: result,
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_camera_permission_status"),
                        targetRef: resolved.extensionId,
                        summary: `camera permission status=${result.status} reason=${result.reason}`,
                        postCheck: { kind: "not_required" },
                    }),
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 카메라 권한 상태 확인 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
    },
};
function resolveYeonjangFileRequest(params, ctx) {
    const selection = resolveYeonjangTargetSelection({
        requestedExtensionId: params.extensionId,
        targetSelector: params.targetSelector,
        expectedTargetSessionId: params.targetSessionId,
        userMessage: ctx.userMessage,
    });
    if (!selection.ok)
        return { ok: false, selection };
    const extensionId = selection.extensionId ?? DEFAULT_YEONJANG_EXTENSION_ID;
    const yeonjangOptions = withYeonjangRequestMetadata(ctx, {
        extensionId,
        ...(selection.targetSessionId ? { metadata: { targetSessionId: selection.targetSessionId } } : {}),
    });
    return { ok: true, selection, extensionId, yeonjangOptions };
}
export const yeonjangFileMetadataTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["file.metadata"],
    name: "yeonjang_file_metadata",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 파일 또는 디렉터리 metadata를 조회합니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            path: {
                type: "string",
                description: "연장 장치에서 조회할 파일 또는 디렉터리 경로입니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: ["path"],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        ctx.onProgress(`연장 ${resolved.extensionId} 파일 정보를 조회합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("file.metadata", {
                path: params.path,
            }, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: true,
                output: formatFileMetadataOutput(resolved.extensionId, result),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    file: result,
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_file_metadata"),
                        targetRef: resolved.extensionId,
                        summary: `file metadata kind=${result.kind} bytes=${result.bytes ?? "unknown"}`,
                        postCheck: { kind: "not_required" },
                    }),
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 파일 정보 조회 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
    },
};
export const yeonjangFileListTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["file.list"],
    name: "yeonjang_file_list",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 디렉터리 목록을 조회합니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            path: {
                type: "string",
                description: "연장 장치에서 목록을 조회할 디렉터리 경로입니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: ["path"],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        ctx.onProgress(`연장 ${resolved.extensionId} 파일 목록을 조회합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("file.list", {
                path: params.path,
            }, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: true,
                output: formatFileListOutput(resolved.extensionId, result),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    listing: result,
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_file_list"),
                        targetRef: resolved.extensionId,
                        summary: `file list path=${result.path} entries=${result.entries.length}`,
                        postCheck: { kind: "not_required" },
                    }),
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 파일 목록 조회 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
    },
};
export const yeonjangFileReadTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["file.read"],
    name: "yeonjang_file_read",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 UTF-8 텍스트 파일을 읽습니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            path: {
                type: "string",
                description: "연장 장치에서 읽을 파일 경로입니다.",
            },
            maxBytes: {
                type: "number",
                description: "읽을 최대 byte 수입니다. Yeonjang 설정의 max_read_bytes를 초과할 수 없습니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: ["path"],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        ctx.onProgress(`연장 ${resolved.extensionId} 파일을 읽습니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const maxBytes = Number.isFinite(params.maxBytes)
                ? Math.max(1, Math.floor(params.maxBytes))
                : undefined;
            const result = await invokeYeonjangMethod("file.read", {
                path: params.path,
                ...(maxBytes != null ? { max_bytes: maxBytes } : {}),
            }, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: true,
                output: formatFileReadOutput(resolved.extensionId, result),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    file: {
                        path: result.path,
                        encoding: result.encoding,
                        bytesRead: result.bytesRead,
                        totalBytes: result.totalBytes,
                        truncated: result.truncated,
                    },
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_file_read"),
                        targetRef: resolved.extensionId,
                        summary: `file read bytes=${result.bytesRead}/${result.totalBytes} truncated=${result.truncated}`,
                        postCheck: { kind: "not_required" },
                    }),
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 파일 읽기 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
    },
};
export const yeonjangFileSearchTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["file.search"],
    name: "yeonjang_file_search",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 허용된 UTF-8 파일에서 텍스트를 검색합니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            path: {
                type: "string",
                description: "연장 장치에서 검색할 파일 또는 디렉터리 경로입니다.",
            },
            query: {
                type: "string",
                description: "검색할 텍스트입니다. 정규식이 아닌 일반 문자열로 처리됩니다.",
            },
            maxResults: {
                type: "number",
                description: "반환할 최대 검색 결과 수입니다. 기본값은 50개입니다.",
            },
            maxPreviewChars: {
                type: "number",
                description: "각 결과에 표시할 미리보기 최대 글자 수입니다. 기본값은 160자입니다.",
            },
            maxBytesPerFile: {
                type: "number",
                description: "파일 하나에서 읽을 최대 byte 수입니다. Yeonjang 설정의 max_read_bytes를 초과할 수 없습니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: ["path", "query"],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        ctx.onProgress(`연장 ${resolved.extensionId} 파일을 검색합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const maxResults = Number.isFinite(params.maxResults)
                ? Math.max(1, Math.floor(params.maxResults))
                : undefined;
            const maxPreviewChars = Number.isFinite(params.maxPreviewChars)
                ? Math.max(1, Math.floor(params.maxPreviewChars))
                : undefined;
            const maxBytesPerFile = Number.isFinite(params.maxBytesPerFile)
                ? Math.max(1, Math.floor(params.maxBytesPerFile))
                : undefined;
            const result = await invokeYeonjangMethod("file.search", {
                path: params.path,
                query: params.query,
                ...(maxResults != null ? { max_results: maxResults } : {}),
                ...(maxPreviewChars != null ? { max_preview_chars: maxPreviewChars } : {}),
                ...(maxBytesPerFile != null ? { max_bytes_per_file: maxBytesPerFile } : {}),
            }, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: true,
                output: formatFileSearchOutput(resolved.extensionId, result),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    search: {
                        path: result.path,
                        query: result.query,
                        resultCount: result.resultCount,
                        skippedFiles: result.skippedFiles,
                        truncated: result.truncated,
                        matches: result.matches.map((match) => ({
                            path: match.path,
                            lineNumber: match.lineNumber,
                            byteOffset: match.byteOffset,
                            truncated: match.truncated,
                        })),
                    },
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_file_search"),
                        targetRef: resolved.extensionId,
                        summary: `file search results=${result.resultCount} skipped=${result.skippedFiles} truncated=${result.truncated}`,
                        postCheck: { kind: "not_required" },
                    }),
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 파일 검색 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
    },
};
export const yeonjangFileWriteTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["file.write"],
    name: "yeonjang_file_write",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 UTF-8 텍스트 파일을 씁니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            path: {
                type: "string",
                description: "연장 장치에서 쓸 파일 경로입니다.",
            },
            text: {
                type: "string",
                description: "파일에 기록할 UTF-8 텍스트입니다.",
            },
            overwrite: {
                type: "boolean",
                description: "기존 파일 덮어쓰기 여부입니다. 기본값은 false입니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: ["path", "text"],
    },
    riskLevel: "moderate",
    requiresApproval: true,
    sideEffect: {
        effectClass: "local_write",
        compensationSupport: "irreversible",
        targetRef: yeonjangFileTargetRef,
        expectedState: (params) => ({
            exists: true,
            bytes: Buffer.byteLength(params.text, "utf8"),
        }),
        observe: async (params, _ctx, result) => observeYeonjangFilePostCheck(params, {
            exists: true,
            bytes: Buffer.byteLength(params.text, "utf8"),
        }, result),
    },
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        const reboundSelection = revalidateYeonjangTargetSelection({ selection: resolved.selection });
        if (!reboundSelection.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(reboundSelection),
            };
        }
        recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "file.write", ctx });
        ctx.onProgress(`연장 ${resolved.extensionId} 파일 쓰기를 요청합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("file.write", {
                path: params.path,
                text: params.text,
                overwrite: params.overwrite === true,
            }, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: result.postCheck.verified,
                output: formatFileWriteOutput(resolved.extensionId, result),
                ...(result.postCheck.verified ? {} : { error: "post_check_failed" }),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    file: result,
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_file_write"),
                        targetRef: resolved.extensionId,
                        summary: `file write bytes=${result.bytesWritten} verified=${result.postCheck.verified}`,
                        postCheck: {
                            kind: result.postCheck.verified ? "verified" : "failed",
                            verified: result.postCheck.verified,
                            exists: result.postCheck.exists,
                            ...(typeof result.postCheck.bytes === "number" ? { bytes: result.postCheck.bytes } : {}),
                        },
                    }),
                    ...buildYeonjangTargetResolutionDetails(reboundSelection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 파일 쓰기 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(reboundSelection),
                },
            };
        }
    },
};
export const yeonjangFilePatchTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["file.patch"],
    name: "yeonjang_file_patch",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 UTF-8 텍스트 파일에 exact single-match patch를 적용합니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            path: {
                type: "string",
                description: "연장 장치에서 patch할 파일 경로입니다.",
            },
            expectedText: {
                type: "string",
                description: "파일 안에 정확히 한 번 존재해야 하는 기존 텍스트입니다.",
            },
            replacementText: {
                type: "string",
                description: "기존 텍스트를 대체할 UTF-8 텍스트입니다.",
            },
            maxBytes: {
                type: "number",
                description: "patch 전에 읽을 최대 byte 수입니다. Yeonjang 설정의 max_write_bytes를 초과할 수 없습니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: ["path", "expectedText", "replacementText"],
    },
    riskLevel: "moderate",
    requiresApproval: true,
    sideEffect: {
        effectClass: "local_write",
        compensationSupport: "irreversible",
        targetRef: yeonjangFileTargetRef,
        expectedState: (params) => ({
            exists: true,
            expectedTextHash: hashUtf8(params.expectedText),
            replacementTextHash: hashUtf8(params.replacementText),
            replacementBytes: Buffer.byteLength(params.replacementText, "utf8"),
        }),
        observe: async (params, _ctx, result) => observeYeonjangFilePostCheck(params, {
            exists: true,
            expectedTextHash: hashUtf8(params.expectedText),
            replacementTextHash: hashUtf8(params.replacementText),
            replacementBytes: Buffer.byteLength(params.replacementText, "utf8"),
        }, result),
    },
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        const reboundSelection = revalidateYeonjangTargetSelection({ selection: resolved.selection });
        if (!reboundSelection.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(reboundSelection),
            };
        }
        recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "file.patch", ctx });
        ctx.onProgress(`연장 ${resolved.extensionId} 파일 패치를 요청합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const maxBytes = Number.isFinite(params.maxBytes)
                ? Math.max(1, Math.floor(params.maxBytes))
                : undefined;
            const result = await invokeYeonjangMethod("file.patch", {
                path: params.path,
                expected_text: params.expectedText,
                replacement_text: params.replacementText,
                ...(maxBytes != null ? { max_bytes: maxBytes } : {}),
            }, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            const verified = result.changed && result.postCheck.verified;
            return {
                success: verified,
                output: formatFilePatchOutput(resolved.extensionId, result),
                ...(verified ? {} : { error: result.reason || "post_check_failed" }),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    file: result,
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_file_patch"),
                        targetRef: resolved.extensionId,
                        summary: `file patch changed=${result.changed} matchCount=${result.matchCount} verified=${result.postCheck.verified}`,
                        postCheck: {
                            kind: result.postCheck.verified ? "verified" : "failed",
                            verified: result.postCheck.verified,
                            exists: result.postCheck.exists,
                            ...(typeof result.postCheck.bytes === "number" ? { bytes: result.postCheck.bytes } : {}),
                            ...(result.reason ? { reason: result.reason } : {}),
                        },
                    }),
                    ...buildYeonjangTargetResolutionDetails(reboundSelection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 파일 패치 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(reboundSelection),
                },
            };
        }
    },
};
export const yeonjangFileDeleteTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["file.delete"],
    name: "yeonjang_file_delete",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 파일 또는 빈 디렉터리를 삭제합니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            path: {
                type: "string",
                description: "연장 장치에서 삭제할 파일 또는 빈 디렉터리 경로입니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: ["path"],
    },
    riskLevel: "dangerous",
    requiresApproval: true,
    sideEffect: {
        effectClass: "destructive",
        compensationSupport: "irreversible",
        targetRef: yeonjangFileTargetRef,
        expectedState: () => ({ exists: false }),
        observe: async (params, _ctx, result) => observeYeonjangFilePostCheck(params, { exists: false }, result),
    },
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        const reboundSelection = revalidateYeonjangTargetSelection({ selection: resolved.selection });
        if (!reboundSelection.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(reboundSelection),
            };
        }
        recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "file.delete", ctx });
        ctx.onProgress(`연장 ${resolved.extensionId} 파일 삭제를 요청합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("file.delete", {
                path: params.path,
            }, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: result.postCheck.verified,
                output: formatFileDeleteOutput(resolved.extensionId, result),
                ...(result.postCheck.verified ? {} : { error: "post_check_failed" }),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    file: result,
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_file_delete"),
                        targetRef: resolved.extensionId,
                        summary: `file delete deleted=${result.deleted} verified=${result.postCheck.verified}`,
                        postCheck: {
                            kind: result.postCheck.verified ? "verified" : "failed",
                            verified: result.postCheck.verified,
                            exists: result.postCheck.exists,
                            ...(typeof result.postCheck.bytes === "number" ? { bytes: result.postCheck.bytes } : {}),
                        },
                    }),
                    ...buildYeonjangTargetResolutionDetails(reboundSelection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 파일 삭제 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(reboundSelection),
                },
            };
        }
    },
};
export const yeonjangDiskInfoTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["disk.info"],
    name: "yeonjang_disk_info",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 디스크 metadata와 용량 정보를 조회합니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            path: {
                type: "string",
                description: "연장 장치에서 디스크 정보를 조회할 경로입니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: ["path"],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        ctx.onProgress(`연장 ${resolved.extensionId} 디스크 정보를 조회합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("disk.info", {
                path: params.path,
            }, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: true,
                output: formatDiskInfoOutput(resolved.extensionId, result),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    disk: result,
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_disk_info"),
                        targetRef: resolved.extensionId,
                        summary: `disk info exists=${result.exists} total=${result.totalBytes ?? "unknown"} free=${result.freeBytes ?? "unknown"}`,
                        postCheck: { kind: "not_required" },
                    }),
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 디스크 정보 조회 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
    },
};
export const yeonjangDiskUsageTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["disk.usage"],
    name: "yeonjang_disk_usage",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 디스크 사용량을 조회합니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            path: {
                type: "string",
                description: "연장 장치에서 디스크 사용량을 조회할 경로입니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: ["path"],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        ctx.onProgress(`연장 ${resolved.extensionId} 디스크 사용량을 조회합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("disk.usage", {
                path: params.path,
            }, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: true,
                output: formatDiskUsageOutput(resolved.extensionId, result),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    disk: result,
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_disk_usage"),
                        targetRef: resolved.extensionId,
                        summary: `disk usage total=${result.totalBytes} free=${result.freeBytes} available=${result.availableBytes}`,
                        postCheck: { kind: "not_required" },
                    }),
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 디스크 사용량 조회 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
    },
};
export const yeonjangDiskExistsTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["disk.exists"],
    name: "yeonjang_disk_exists",
    description: "MQTT로 연결된 Yeonjang 연장 장치에서 경로 존재 여부를 확인합니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            path: {
                type: "string",
                description: "연장 장치에서 존재 여부를 확인할 경로입니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: ["path"],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        ctx.onProgress(`연장 ${resolved.extensionId} 경로 존재 여부를 확인합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("disk.exists", {
                path: params.path,
            }, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: true,
                output: formatDiskExistsOutput(resolved.extensionId, result),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    disk: result,
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_disk_exists"),
                        targetRef: resolved.extensionId,
                        summary: `disk exists exists=${result.exists} kind=${result.kind ?? "unknown"}`,
                        postCheck: { kind: "not_required" },
                    }),
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 경로 존재 확인 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
    },
};
export const yeonjangProcessListTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["process.list"],
    name: "yeonjang_process_list",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 프로세스 목록을 조회합니다. command line, cwd, env는 반환하지 않습니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            limit: {
                type: "number",
                description: "반환할 최대 프로세스 수입니다. 기본값은 50, 최대값은 Yeonjang 런타임 계약을 따릅니다.",
            },
            nameContains: {
                type: "string",
                description: "프로세스 이름에 포함될 문자열입니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: [],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        ctx.onProgress(`연장 ${resolved.extensionId} 프로세스 목록을 조회합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const limit = Number.isFinite(params.limit) ? Math.max(1, Math.floor(params.limit)) : undefined;
            const result = await invokeYeonjangMethod("process.list", {
                ...(limit != null ? { limit } : {}),
                ...(params.nameContains?.trim() ? { name_contains: params.nameContains.trim() } : {}),
            }, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: true,
                output: formatProcessListOutput(resolved.extensionId, result),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    processes: result,
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_process_list"),
                        targetRef: resolved.extensionId,
                        summary: `process list count=${result.count}/${result.totalCount} truncated=${result.truncated}`,
                        postCheck: { kind: "not_required" },
                    }),
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 프로세스 목록 조회 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
    },
};
export const yeonjangProcessInfoTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["process.info"],
    name: "yeonjang_process_info",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 단일 프로세스 정보를 조회합니다. command line, cwd, env는 반환하지 않습니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            pid: {
                type: "number",
                description: "조회할 프로세스 ID입니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: ["pid"],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        ctx.onProgress(`연장 ${resolved.extensionId} 프로세스 정보를 조회합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("process.info", {
                pid: Math.max(0, Math.floor(params.pid)),
            }, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: true,
                output: formatProcessInfoOutput(resolved.extensionId, result),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    process: result,
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_process_info"),
                        targetRef: resolved.extensionId,
                        summary: `process info pid=${result.process.pid} status=${result.process.status}`,
                        postCheck: { kind: "not_required" },
                    }),
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 프로세스 정보 조회 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
    },
};
export const yeonjangBrowserListTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["browser.list"],
    name: "yeonjang_browser_list",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 실행 중인 브라우저 후보를 조회합니다. URL, 탭 제목, command line, cwd, profile path, env는 반환하지 않습니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            limit: {
                type: "number",
                description: "반환할 최대 브라우저 후보 수입니다. 기본값은 50입니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: [],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        ctx.onProgress(`연장 ${resolved.extensionId} 브라우저 후보를 조회합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const limit = Number.isFinite(params.limit) ? Math.max(1, Math.floor(params.limit)) : undefined;
            const result = await invokeYeonjangMethod("browser.list", {
                ...(limit != null ? { limit } : {}),
            }, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: true,
                output: formatBrowserListOutput(resolved.extensionId, result),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    browsers: result,
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_browser_list"),
                        targetRef: resolved.extensionId,
                        summary: `browser list count=${result.count}/${result.totalCount} truncated=${result.truncated}`,
                        postCheck: { kind: "not_required" },
                    }),
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 브라우저 후보 조회 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
    },
};
export const yeonjangBrowserActiveHintTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["browser.active_hint"],
    name: "yeonjang_browser_active_hint",
    description: "MQTT로 연결된 Yeonjang 연장 장치에서 활성 브라우저 후보를 추정합니다. 탭, URL, 프로필 정보는 읽지 않습니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: [],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        ctx.onProgress(`연장 ${resolved.extensionId} 활성 브라우저 후보를 확인합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("browser.active_hint", {}, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: true,
                output: formatBrowserActiveHintOutput(resolved.extensionId, result),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    browser: result,
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_browser_active_hint"),
                        targetRef: resolved.extensionId,
                        summary: `browser active hint available=${result.available} reason=${result.reason}`,
                        postCheck: { kind: "not_required" },
                    }),
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 활성 브라우저 후보 확인 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
    },
};
export const yeonjangBrowserOpenUrlTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["browser.open_url"],
    name: "yeonjang_browser_open_url",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 기본 브라우저로 http 또는 https URL을 엽니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            url: {
                type: "string",
                description: "연장 장치의 기본 브라우저로 열 http 또는 https URL입니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: ["url"],
    },
    riskLevel: "moderate",
    requiresApproval: true,
    sideEffect: {
        effectClass: "external_write",
        compensationSupport: "irreversible",
        targetRef: yeonjangBrowserTargetRef,
        expectedState: (params) => browserOpenUrlExpectedState(params.url),
        observe: async (params, _ctx, result) => observeYeonjangBrowserOpenUrl(params, result),
    },
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        const reboundSelection = revalidateYeonjangTargetSelection({ selection: resolved.selection });
        if (!reboundSelection.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(reboundSelection),
            };
        }
        recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "browser.open_url", ctx });
        ctx.onProgress(`연장 ${resolved.extensionId} 브라우저 URL 열기를 요청합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("browser.open_url", {
                url: params.url,
            }, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: result.opened === true,
                output: formatBrowserOpenUrlOutput(resolved.extensionId, result),
                ...(result.opened ? {} : { error: "browser_open_url_failed" }),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    browser: {
                        opened: result.opened,
                        urlScheme: result.urlScheme,
                        urlHash: hashUtf8(params.url.trim()),
                        urlLength: params.url.trim().length,
                        postCheckReason: result.postCheck.reason,
                    },
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_browser_open_url"),
                        targetRef: resolved.extensionId,
                        summary: `browser open url opened=${result.opened} scheme=${result.urlScheme} urlHash=${hashUtf8(params.url.trim())}`,
                        postCheck: {
                            kind: "unverifiable",
                            verified: false,
                            reason: result.postCheck.reason || "llm_goal_validation_required",
                        },
                    }),
                    ...buildYeonjangTargetResolutionDetails(reboundSelection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 브라우저 URL 열기 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(reboundSelection),
                },
            };
        }
    },
};
export const yeonjangBrowserFocusTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["browser.focus"],
    name: "yeonjang_browser_focus",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 브라우저 또는 브라우저 창 포커스를 준비합니다. 실행 후 focused target observation으로 별도 검증해야 합니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            targetAlias: {
                type: "string",
                description: "사용자가 부르는 브라우저 또는 창의 공개 대상 이름입니다.",
            },
            processName: {
                type: "string",
                description: "대상 브라우저 프로세스 또는 앱 이름입니다.",
            },
            title: {
                type: "string",
                description: "대상 창 제목입니다. public result에는 원문을 저장하지 않습니다.",
            },
            url: {
                type: "string",
                description: "대상 탭 URL입니다. http 또는 https만 허용하고 public result에는 원문을 저장하지 않습니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: [],
    },
    riskLevel: "moderate",
    requiresApproval: true,
    sideEffect: createYeonjangBrowserFocusSideEffect({
        target: (params) => browserFocusTarget(params) ?? browserFocusExpectedState(params, {}).target,
        targetRef: (params) => browserFocusTargetRef(params),
        expectedState: (params, ctx) => browserFocusExpectedState(params, ctx),
    }),
    async execute(params, ctx) {
        const target = browserFocusTarget(params);
        if (!target) {
            return {
                success: false,
                output: "브라우저 포커스 대상 이름, 프로세스명, 제목, URL 중 하나가 필요합니다.",
                error: "target_identity_required",
                details: {
                    kind: "browser_focus_pre_dispatch_blocked",
                    reasonCode: "target_identity_required",
                },
            };
        }
        if (!hasExplicitBrowserFocusApproval(ctx)) {
            return {
                success: false,
                output: "브라우저 포커스 변경은 명시적인 사용자 승인이 필요합니다.",
                error: "side_effect_authorization_required",
                details: {
                    kind: "browser_focus_pre_dispatch_blocked",
                    reasonCode: "side_effect_authorization_required",
                    method: "browser.focus",
                    target,
                },
            };
        }
        const authorizationReceipt = ctx.authorizationReceipt;
        if (!authorizationReceipt?.approvalDecision) {
            return {
                success: false,
                output: "브라우저 포커스 변경 승인 receipt를 확인하지 못해 실행을 시작하지 않았습니다.",
                error: "side_effect_authorization_required",
                details: {
                    kind: "browser_focus_pre_dispatch_blocked",
                    reasonCode: "side_effect_authorization_required",
                    method: "browser.focus",
                    target,
                },
            };
        }
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        const reboundSelection = revalidateYeonjangTargetSelection({ selection: resolved.selection });
        if (!reboundSelection.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(reboundSelection),
            };
        }
        const admissionIssue = ctx.yeonjangBrowserFocusExecutionAdmissionIssuer?.issue({
            extensionId: resolved.extensionId,
            ...(reboundSelection.targetSessionId ? { sessionId: reboundSelection.targetSessionId } : {}),
            targetHash: hashYeonjangBrowserFocusExecutionTarget(target),
            approvalScopeId: authorizationReceipt.permissionScope,
        });
        if (admissionIssue && !admissionIssue.ok) {
            return {
                success: false,
                output: "브라우저 포커스 실행 승인을 준비하지 못해 요청을 전송하지 않았습니다.",
                error: admissionIssue.reasonCode,
                details: {
                    kind: "browser_focus_pre_dispatch_blocked",
                    reasonCode: admissionIssue.reasonCode,
                    method: "browser.focus",
                    target,
                    ...buildBrowserFocusPublicTargetResolutionDetails(reboundSelection),
                },
            };
        }
        // The runtime creates this receipt. Caller input is never accepted as an
        // execution precondition; only a runtime-issued signed admission can enable
        // the remote side effect.
        const executionPreDispatch = {
            schemaVersion: "knowbee.yeonjang-browser-focus-pre-dispatch.v1",
            method: "browser.focus",
            toolName: "yeonjang_browser_focus",
            status: "dispatch_prepared",
            reasonCode: admissionIssue?.ok
                ? "browser_focus_execution_admission_issued"
                : "browser_focus_execution_admission_key_unavailable",
            invokeNow: admissionIssue?.ok === true,
        };
        recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "browser.focus", ctx });
        ctx.onProgress(`연장 ${resolved.extensionId} 브라우저 포커스 요청을 준비합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("browser.focus", {
                target,
                approvalReceipt: {
                    method: "browser.focus",
                    decision: authorizationReceipt.approvalDecision,
                    scopeId: authorizationReceipt.permissionScope,
                    approved: true,
                },
                preDispatch: executionPreDispatch,
                ...(admissionIssue?.ok ? { executionAdmission: admissionIssue.admission } : {}),
            }, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            if (!result || typeof result !== "object" || Array.isArray(result)) {
                return {
                    success: false,
                    output: `연장 "${resolved.extensionId}"이 browser.focus 실행 결과를 반환하지 않았습니다.`,
                    error: "browser_focus_runtime_response_invalid",
                    details: {
                        via: "yeonjang",
                        extensionId: resolved.extensionId,
                        method: "browser.focus",
                        target,
                        ...buildBrowserFocusPublicTargetResolutionDetails(reboundSelection),
                    },
                };
            }
            const observedFocusedTarget = isBrowserFocusPublicTargetProjection(result.observedFocusedTarget)
                ? result.observedFocusedTarget
                : undefined;
            const postCheck = evaluateYeonjangBrowserFocusPostCheck({
                commandAccepted: result.commandAccepted === true,
                expectedTarget: target,
                ...(observedFocusedTarget ? { observedFocusedTarget } : {}),
            });
            const evidencePostCheck = postCheck.state === "VERIFIED"
                ? {
                    kind: "verified",
                    verified: true,
                    reason: postCheck.reasonCode,
                }
                : {
                    kind: postCheck.state === "FAILED" ? "failed" : "unverifiable",
                    verified: false,
                    reason: postCheck.reasonCode,
                };
            return {
                success: postCheck.state === "VERIFIED",
                output: formatBrowserFocusOutput(resolved.extensionId, result, postCheck),
                ...(result.commandAccepted === true ? {} : { error: "browser_focus_command_not_accepted" }),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    method: "browser.focus",
                    commandAccepted: result.commandAccepted === true,
                    target,
                    ...(observedFocusedTarget ? { observedFocusedTarget } : {}),
                    postCheck: {
                        state: postCheck.state,
                        reasonCode: postCheck.reasonCode,
                    },
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_browser_focus"),
                        targetRef: resolved.extensionId,
                        summary: `browser focus post-check state=${postCheck.state} target=${target.displayName}`,
                        postCheck: evidencePostCheck,
                    }),
                    ...buildBrowserFocusPublicTargetResolutionDetails(reboundSelection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 브라우저 포커스 요청 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    method: "browser.focus",
                    target,
                    ...buildBrowserFocusPublicTargetResolutionDetails(reboundSelection),
                },
            };
        }
    },
};
export const yeonjangClipboardReadTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["clipboard.read"],
    name: "yeonjang_clipboard_read",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 클립보드 텍스트를 읽습니다. 원문은 응답 본문에만 포함하고 evidence에는 저장하지 않습니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: [],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        ctx.onProgress(`연장 ${resolved.extensionId} 클립보드를 읽습니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("clipboard.read", {}, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: true,
                output: formatClipboardReadOutput(resolved.extensionId, result),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    clipboard: {
                        charCount: result.charCount,
                        byteLength: result.byteLength,
                        empty: result.empty,
                        contentHash: result.contentHash,
                    },
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_clipboard_read"),
                        targetRef: resolved.extensionId,
                        summary: `clipboard read chars=${result.charCount} bytes=${result.byteLength} empty=${result.empty} hash=${result.contentHash}`,
                        postCheck: { kind: "not_required" },
                    }),
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 클립보드 읽기 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
    },
};
export const yeonjangClipboardWriteTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["clipboard.write"],
    name: "yeonjang_clipboard_write",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 클립보드에 UTF-8 텍스트를 씁니다. 결과와 evidence에는 원문을 저장하지 않습니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            text: {
                type: "string",
                description: "연장 장치의 클립보드에 쓸 UTF-8 텍스트입니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: ["text"],
    },
    riskLevel: "moderate",
    requiresApproval: true,
    sideEffect: {
        effectClass: "local_write",
        compensationSupport: "irreversible",
        targetRef: yeonjangClipboardTargetRef,
        expectedState: (params) => clipboardWriteExpectedState(params.text),
        observe: async (params, _ctx, result) => observeYeonjangClipboardWrite(params, result),
    },
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        const reboundSelection = revalidateYeonjangTargetSelection({ selection: resolved.selection });
        if (!reboundSelection.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(reboundSelection),
            };
        }
        recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "clipboard.write", ctx });
        ctx.onProgress(`연장 ${resolved.extensionId} 클립보드 쓰기를 요청합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("clipboard.write", {
                text: params.text,
            }, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: result.postCheck.verified,
                output: formatClipboardWriteOutput(resolved.extensionId, result),
                ...(result.postCheck.verified ? {} : { error: "post_check_failed" }),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    clipboard: {
                        charCount: result.charCount,
                        byteLength: result.byteLength,
                        empty: result.empty,
                        contentHash: result.contentHash,
                        postCheck: result.postCheck,
                    },
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_clipboard_write"),
                        targetRef: resolved.extensionId,
                        summary: `clipboard write chars=${result.charCount} bytes=${result.byteLength} verified=${result.postCheck.verified} hash=${result.contentHash}`,
                        postCheck: {
                            kind: result.postCheck.verified ? "verified" : "failed",
                            verified: result.postCheck.verified,
                            bytes: result.postCheck.byteLength ?? result.byteLength,
                            ...(result.postCheck.reason ? { reason: result.postCheck.reason } : {}),
                        },
                    }),
                    ...buildYeonjangTargetResolutionDetails(reboundSelection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 클립보드 쓰기 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(reboundSelection),
                },
            };
        }
    },
};
export const yeonjangNetworkStatusTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["network.status"],
    name: "yeonjang_network_status",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 로컬 네트워크 인터페이스 카운터를 조회합니다. 외부 연결 검사는 하지 않습니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: [],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        ctx.onProgress(`연장 ${resolved.extensionId} 네트워크 상태를 조회합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("network.status", {}, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: true,
                output: formatNetworkStatusOutput(resolved.extensionId, result),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    network: {
                        interfaceCount: result.interfaceCount,
                        externalProbe: result.externalProbe,
                    },
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_network_status"),
                        targetRef: resolved.extensionId,
                        summary: `network status interfaces=${result.interfaceCount} externalProbe=${result.externalProbe}`,
                        postCheck: { kind: "not_required" },
                    }),
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 네트워크 상태 조회 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
    },
};
export const yeonjangDeviceStatusTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["device.status"],
    name: "yeonjang_device_status",
    description: "MQTT로 연결된 Yeonjang 연장 장치의 리소스 지원 상태와 권한 요약을 조회합니다. 내부 ID와 원본 경로는 반환하지 않습니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 15초입니다.",
            },
        },
        required: [],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params, ctx) {
        const resolved = resolveYeonjangFileRequest(params, ctx);
        if (!resolved.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(resolved.selection),
            };
        }
        ctx.onProgress(`연장 ${resolved.extensionId} 장치 상태를 조회합니다.`);
        try {
            const timeoutMs = resolveTimeoutMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("device.status", {}, {
                ...resolved.yeonjangOptions,
                ...(timeoutMs != null ? { timeoutMs } : {}),
            });
            return {
                success: true,
                output: formatDeviceStatusOutput(resolved.extensionId, result),
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    device: {
                        platform: result.platform,
                        resourceGroups: Object.keys(result.resources),
                    },
                    evidence: buildYeonjangEvidenceFromMapping({
                        mapping: yeonjangMapping("yeonjang_device_status"),
                        targetRef: resolved.extensionId,
                        summary: `device status platform=${result.platform} groups=${Object.keys(result.resources).length}`,
                        postCheck: { kind: "not_required" },
                    }),
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            return {
                success: false,
                output: `연장 "${resolved.extensionId}" 장치 상태 조회 실패: ${message}`,
                error: message,
                details: {
                    via: "yeonjang",
                    extensionId: resolved.extensionId,
                    ...buildYeonjangTargetResolutionDetails(resolved.selection),
                },
            };
        }
    },
};
export const yeonjangCameraCaptureTool = {
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["camera.capture"],
    name: "yeonjang_camera_capture",
    description: "MQTT로 연결된 Yeonjang 연장에 카메라 캡처를 요청합니다.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            deviceId: {
                type: "string",
                description: "캡처할 카메라 장치 ID. 비우면 기본 카메라를 사용합니다.",
            },
            requestedFacing: {
                type: "string",
                enum: ["front", "rear"],
                description: "LLM 계획이 선택한 전면 또는 후면 카메라 조건입니다.",
            },
            timeoutSec: {
                type: "number",
                description: "응답 대기 시간(초). 기본값은 60초입니다.",
            },
        },
        required: [],
    },
    riskLevel: "moderate",
    requiresApproval: true,
    sideEffect: {
        effectClass: "local_write",
        compensationSupport: "irreversible",
        prepareOperation: prepareYeonjangCameraOperation,
        canonicalOperation: canonicalYeonjangCameraOperation,
        targetRef: yeonjangCameraTargetRef,
        expectedState: cameraExpectedState,
        observe: async (params, _ctx, result) => observeYeonjangCameraCapture(params, result),
        effectEvidenceRefs: (params, _ctx, result) => cameraEffectEvidenceRefs(params, result),
        observeCurrent: observeCurrentYeonjangCameraCapture,
    },
    async execute(params, ctx) {
        const selection = resolveYeonjangTargetSelection({
            requestedExtensionId: params.extensionId,
            targetSelector: params.targetSelector,
            expectedTargetSessionId: params.targetSessionId,
        });
        if (!selection.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(selection),
            };
        }
        const extensionId = selection.extensionId ?? DEFAULT_YEONJANG_EXTENSION_ID;
        const yeonjangOptions = withYeonjangRequestMetadata(ctx, {
            extensionId,
            ...(selection.targetSessionId ? { metadata: { targetSessionId: selection.targetSessionId } } : {}),
        }, "camera");
        ctx.onProgress(`연장 ${extensionId} 카메라 캡처를 요청합니다.`);
        try {
            const requestedFacing = params.requestedFacing;
            if (requestedFacing && params.deviceId) {
                const reboundSelection = revalidateYeonjangTargetSelection({ selection });
                if (!reboundSelection.ok) {
                    return {
                        success: false,
                        ...buildYeonjangTargetSelectionFailure(reboundSelection),
                    };
                }
                recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "camera.list", ctx });
                const listTimeoutMs = resolveTimeoutMs(15);
                const listedDevices = await invokeYeonjangMethod("camera.list", {}, {
                    ...yeonjangOptions,
                    ...(listTimeoutMs != null ? { timeoutMs: listTimeoutMs } : {}),
                });
                const selectedDevice = findCameraDeviceById(listedDevices, params.deviceId);
                if (selectedDevice
                    && cameraDeviceFacing(selectedDevice) !== requestedFacing) {
                    const capabilityKnown = cameraDeviceFacing(selectedDevice) !== null;
                    return {
                        success: false,
                        output: capabilityKnown
                            ? buildCameraFacingUnsupportedMessage({
                                deviceName: selectedDevice.name,
                                facing: requestedFacing,
                            })
                            : buildCameraFacingCapabilityUnknownMessage({
                                deviceName: selectedDevice.name,
                                facing: requestedFacing,
                            }),
                        error: capabilityKnown
                            ? "CAMERA_FACING_SELECTION_UNSUPPORTED"
                            : "CAMERA_FACING_CAPABILITY_UNKNOWN",
                        details: {
                            via: "yeonjang",
                            extensionId,
                            deviceId: params.deviceId,
                            deviceName: selectedDevice.name,
                            requestedFacing,
                            constraint: capabilityKnown
                                ? "camera_facing_selection_unsupported"
                                : "camera_facing_capability_unknown",
                            ...buildYeonjangTargetResolutionDetails(reboundSelection),
                        },
                    };
                }
            }
            const reboundSelection = revalidateYeonjangTargetSelection({ selection });
            if (!reboundSelection.ok) {
                return {
                    success: false,
                    ...buildYeonjangTargetSelectionFailure(reboundSelection),
                };
            }
            recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "camera.capture", ctx });
            const operationBudgetMs = resolveCameraCaptureOperationBudgetMs(params.timeoutSec);
            const result = await invokeYeonjangMethod("camera.capture", {
                ...(params.deviceId ? { device_id: params.deviceId } : {}),
                inline_base64: true,
                capture_timeout_ms: operationBudgetMs,
            }, {
                ...yeonjangOptions,
                timeoutMs: cameraCaptureTransportTimeoutMs(operationBudgetMs),
            });
            const details = {
                via: "yeonjang",
                extensionId,
                ...(result.device_id ? { deviceId: result.device_id } : {}),
                ...(requestedFacing ? { requestedFacing } : {}),
                ...(result.file_name ? { fileName: result.file_name } : {}),
                ...(result.file_extension ? { fileExtension: result.file_extension } : {}),
                ...(result.mime_type ? { mimeType: result.mime_type } : {}),
                ...(typeof result.size_bytes === "number" ? { sizeBytes: result.size_bytes } : {}),
                transferEncoding: "base64",
                ...buildYeonjangTargetResolutionDetails(reboundSelection),
            };
            const binaryValidation = validateYeonjangBinaryCaptureResult(result);
            if (!binaryValidation.ok) {
                return {
                    success: false,
                    output: binaryValidation.message,
                    error: binaryValidation.errorCode,
                    details: {
                        via: "yeonjang",
                        extensionId,
                        artifactVerification: {
                            status: "failed",
                            reasonCode: binaryValidation.reasonCode,
                        },
                        ...buildYeonjangTargetResolutionDetails(reboundSelection),
                    },
                };
            }
            const localSavedPath = saveInlineCapture(extensionId, binaryValidation.bytes, binaryValidation.mimeType, ctx.artifactStorage.rootDir);
            let artifactDetails;
            const localFileSize = statSync(localSavedPath).size;
            if (localFileSize < 1) {
                ctx.artifactStorage.fileSystem.remove(localSavedPath);
                return {
                    success: false,
                    output: "카메라 이미지를 저장했지만 파일이 비어 있어 캡처를 완료하지 않았습니다.",
                    error: "CAMERA_ARTIFACT_EMPTY",
                    details: {
                        via: "yeonjang",
                        extensionId,
                        artifactVerification: {
                            status: "failed",
                            reasonCode: "camera_artifact_empty",
                        },
                        ...buildYeonjangTargetResolutionDetails(reboundSelection),
                    },
                };
            }
            const artifactRef = `artifact:${recordArtifactMetadata({
                artifactPath: localSavedPath,
                ownerChannel: ctx.source,
                sourceRunId: ctx.runId,
                requestGroupId: ctx.requestGroupId ?? ctx.runId,
                mimeType: binaryValidation.mimeType,
                sizeBytes: localFileSize,
                retentionPolicy: "standard",
                dataClassification: "user",
                metadata: {
                    sourceKind: "yeonjang_camera_capture",
                    artifactRefVisibility: "bounded",
                },
            }, ctx.artifactStorage)}`;
            details.localFileSize = localFileSize;
            details.artifactVerification = {
                status: "verified",
                artifactRef,
                mimeType: binaryValidation.mimeType,
                sizeBytes: localFileSize,
            };
            if (ctx.source === "webui" || ctx.source === "telegram") {
                artifactDetails = {
                    kind: "artifact_delivery",
                    channel: ctx.source,
                    artifactRef,
                    size: localFileSize,
                    source: ctx.source,
                    mimeType: binaryValidation.mimeType,
                };
            }
            details.evidence = buildYeonjangEvidenceFromMapping({
                mapping: yeonjangMapping("yeonjang_camera_capture"),
                targetRef: extensionId,
                summary: `camera capture device=${result.device_id ?? "default"} bytes=${localFileSize} artifact=verified`,
                postCheck: {
                    kind: "verified",
                    verified: true,
                    exists: true,
                    bytes: localFileSize,
                    artifactRef,
                    mimeType: binaryValidation.mimeType,
                },
            });
            return {
                success: true,
                output: formatCaptureOutput(extensionId, result),
                details: {
                    ...details,
                    ...(artifactDetails ?? {}),
                },
            };
        }
        catch (error) {
            const message = toolUserFacingErrorMessage(error);
            const failure = cameraCaptureFailureProjection(error);
            return {
                success: false,
                output: `연장 "${extensionId}" 카메라 캡처 실패: ${message}`,
                error: failure.errorCode,
                details: {
                    via: "yeonjang",
                    extensionId,
                    ...(failure.reasonCode
                        ? {
                            failure: {
                                reasonCode: failure.reasonCode,
                                retrySameStrategy: false,
                                ...(failure.terminalStage ? { terminalStage: failure.terminalStage } : {}),
                                ...(failure.retrySafety ? { retrySafety: failure.retrySafety } : {}),
                            },
                        }
                        : {}),
                    ...buildYeonjangTargetResolutionDetails(selection),
                },
            };
        }
    },
};
//# sourceMappingURL=yeonjang.js.map