import { commitFinalDelivery, } from "./channel-finalizer.js";
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js";
import { emitAssistantTextDelivery, resolveAssistantTextDeliveryOutcome, } from "./delivery.js";
import { recordMessageLedgerEvent } from "./message-ledger.js";
import { redactLogText } from "../logger/index.js";
import { containsInternalEvidenceText, redactInternalEvidenceText, } from "../security/internal-evidence-redaction.js";
import { describeAssistantTextDeliveryFailure, summarizeRawErrorActionHintForUser, summarizeRawErrorForUser, } from "./recovery.js";
import { finalResponseRenderProvenanceEvent, renderFinalResponseText as renderFinalResponseTextDefault, } from "./final-response-renderer.js";
import { buildTerminalControlNotice } from "./terminal-control-notice.js";
import { buildCanonicalDeliveryDescriptor, } from "./canonical-finalization-lifecycle.js";
import { buildCanonicalPendingResponseReviewEnvelope } from "./canonical-pending-response-review.js";
import { authorizeUserFacingResponse, } from "./user-facing-response-gate.js";
import { bindTerminalReportForDelivery, reviewTerminalReportResponse, terminalReportRequired, } from "./terminal-report-delivery-binding.js";
import { sanitizeCompletionAwaitingUserText } from "./completion-application.js";
export function recordFirstResponseFromFinalDelivery(delivery, recorder) {
    if (delivery.status !== "delivered" || !delivery.deliveryReceipt)
        return;
    const receipt = delivery.deliveryReceipt;
    if (!receipt.runId || !receipt.receiptRef || receipt.deliveredAtMs === undefined)
        return;
    recorder?.({
        runId: receipt.runId,
        receiptRef: receipt.receiptRef,
        deliveredAtMs: receipt.deliveredAtMs,
    });
}
function hasStandaloneResponseContext(context) {
    return Boolean(context?.originalRequest.trim()
        && context.workDir.trim()
        && (context.provider || context.providerId?.trim())
        && context.model?.trim());
}
function shouldRewriteStandaloneTextSource(_source) {
    return true;
}
function shouldRewriteFinalTextSource(_source) {
    return true;
}
function safeRenderErrorDetail(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactLogText(raw).replace(/\s+/gu, " ").trim().slice(0, 240) || "renderer_error";
}
function sanitizeFinalResponseRawText(raw) {
    const containsInternalEvidence = containsInternalEvidenceText(raw);
    const containsYeonjangBrowserControlContext = /\b(?:yeonjang_browser_open_url|browser\.open_url|yeonjang_browser_focus|browser\.focus)\b/iu.test(raw);
    const withoutInternalEvidence = redactInternalEvidenceText(raw, { replacement: "" });
    const withoutBrowserUrls = containsInternalEvidence || containsYeonjangBrowserControlContext
        ? withoutInternalEvidence.replace(/https?:\/\/[^\s<>"')\]}]+/giu, "")
        : withoutInternalEvidence;
    const withoutBrowserFocusInternals = containsYeonjangBrowserControlContext
        ? withoutBrowserUrls
            .replace(/\braw focused title\b[^|\n]*/giu, "")
            .replace(/\braw focused URL\b[^|\n]*/giu, "")
            .replace(/\bpid\s*=\s*[^\s|,;)\]}]+/giu, "")
            .replace(/\bwindowId\s*=\s*[^\s|,;)\]}]+/giu, "")
            .replace(/\btabId\s*=\s*[^\s|,;)\]}]+/giu, "")
        : withoutBrowserUrls;
    const sanitized = withoutBrowserFocusInternals
        .replace(/[ \t]{2,}/gu, " ")
        .replace(/\n{3,}/gu, "\n\n")
        .trim();
    return sanitized || "요청한 작업의 내부 실행 근거는 사용자에게 노출하지 않고, 검증된 결과만 보고합니다.";
}
async function resolveStandaloneAssistantText(params) {
    if (!shouldRewriteStandaloneTextSource(params.textSource)) {
        return { status: "ready", text: params.text };
    }
    const responseContext = params.responseContext;
    if (!hasStandaloneResponseContext(responseContext)) {
        params.appendRunEvent(params.runId, "user_facing_standalone_rewrite_blocked:missing_context");
        return { status: "blocked", reasonCode: "missing_context" };
    }
    try {
        const rawText = sanitizeFinalResponseRawText(params.text);
        const rendered = await params.renderFinalResponseText({
            runId: params.runId,
            originalRequest: responseContext.originalRequest,
            ...(responseContext.responseLanguageMode
                ? { responseLanguageMode: responseContext.responseLanguageMode }
                : {}),
            rawText,
            textSource: params.textSource,
            model: responseContext.model,
            ...(responseContext.providerId ? { providerId: responseContext.providerId } : {}),
            ...(responseContext.provider ? { provider: responseContext.provider } : {}),
            config: responseContext.config,
            workDir: responseContext.workDir,
            ...(responseContext.identityContext ? { identityContext: responseContext.identityContext } : {}),
            ...(responseContext.failureEvidence ? { failureEvidence: responseContext.failureEvidence } : {}),
            ...(params.contentKind !== "fixed_notice" ? { contentKind: params.contentKind } : {}),
        });
        if (rendered?.text.trim() && rendered.reviewReceipt) {
            params.appendRunEvent(params.runId, "user_facing_standalone_rewritten:llm");
            params.appendRunEvent(params.runId, finalResponseRenderProvenanceEvent({
                eventPrefix: "user_facing_standalone",
                rendered,
                fallbackRawTextSource: params.textSource,
            }));
            return {
                status: "ready",
                text: rendered.text.trim(),
                responseReview: {
                    rawText,
                    rawTextSource: params.textSource,
                    contentKind: params.contentKind,
                    expectedLanguage: responseContext.responseLanguageMode === "translation" ||
                        responseContext.responseLanguageMode === "language_comparison" ||
                        responseContext.responseLanguageMode === "multilingual"
                        ? "unknown"
                        : responseContext.identityContext?.promptLocale ?? "unknown",
                    receipt: rendered.reviewReceipt,
                },
            };
        }
        if (rendered?.text.trim() && !rendered.reviewReceipt) {
            params.appendRunEvent(params.runId, "user_facing_standalone_rewrite_blocked:review_receipt_missing");
            return { status: "blocked", reasonCode: "review_receipt_missing" };
        }
        params.appendRunEvent(params.runId, "user_facing_standalone_rewrite_blocked:empty_output");
        return { status: "blocked", reasonCode: "empty_output" };
    }
    catch (error) {
        const detail = safeRenderErrorDetail(error);
        params.appendRunEvent(params.runId, `user_facing_standalone_rewrite_blocked:error:${detail}`);
        return { status: "blocked", reasonCode: "renderer_error", detail };
    }
}
async function resolveCompletionAssistantText(params) {
    if (!shouldRewriteFinalTextSource(params.textSource)) {
        return { status: "ready", text: params.text };
    }
    const responseContext = params.responseContext;
    if (!hasStandaloneResponseContext(responseContext)) {
        params.appendRunEvent(params.runId, "user_facing_completion_rewrite_blocked:missing_context");
        return { status: "blocked", reasonCode: "missing_context" };
    }
    try {
        const rawText = sanitizeFinalResponseRawText(params.text);
        const rendered = await params.renderFinalResponseText({
            runId: params.runId,
            originalRequest: responseContext.originalRequest,
            ...(responseContext.responseLanguageMode
                ? { responseLanguageMode: responseContext.responseLanguageMode }
                : {}),
            rawText,
            textSource: params.textSource,
            model: responseContext.model,
            ...(responseContext.providerId ? { providerId: responseContext.providerId } : {}),
            ...(responseContext.provider ? { provider: responseContext.provider } : {}),
            config: responseContext.config,
            workDir: responseContext.workDir,
            ...(responseContext.identityContext ? { identityContext: responseContext.identityContext } : {}),
            ...(responseContext.failureEvidence ? { failureEvidence: responseContext.failureEvidence } : {}),
            ...(params.contentKind ? { contentKind: params.contentKind } : {}),
        });
        if (rendered?.text.trim() && rendered.reviewReceipt) {
            params.appendRunEvent(params.runId, "user_facing_completion_rewritten:llm");
            params.appendRunEvent(params.runId, finalResponseRenderProvenanceEvent({
                eventPrefix: "user_facing_completion",
                rendered,
                fallbackRawTextSource: params.textSource,
            }));
            return {
                status: "ready",
                text: rendered.text.trim(),
                responseReview: {
                    rawText,
                    rawTextSource: params.textSource,
                    contentKind: rendered.reviewReceipt.contentKind,
                    expectedLanguage: responseContext.responseLanguageMode === "translation" ||
                        responseContext.responseLanguageMode === "language_comparison" ||
                        responseContext.responseLanguageMode === "multilingual"
                        ? "unknown"
                        : responseContext.identityContext?.promptLocale ?? "unknown",
                    receipt: rendered.reviewReceipt,
                },
            };
        }
        if (rendered?.text.trim() && !rendered.reviewReceipt) {
            params.appendRunEvent(params.runId, "user_facing_completion_rewrite_blocked:review_receipt_missing");
            return { status: "blocked", reasonCode: "review_receipt_missing" };
        }
        params.appendRunEvent(params.runId, "user_facing_completion_rewrite_blocked:empty_output");
        return { status: "blocked", reasonCode: "empty_output" };
    }
    catch (error) {
        const detail = safeRenderErrorDetail(error);
        params.appendRunEvent(params.runId, `user_facing_completion_rewrite_blocked:error:${detail}`);
        return { status: "blocked", reasonCode: "renderer_error", detail };
    }
}
function nonEmpty(value) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
}
function uniqueStrings(values) {
    return [...new Set(values.map((value) => nonEmpty(value)).filter((value) => Boolean(value)))];
}
function deriveMissingRequiredValues(input) {
    const explicitMissing = input.missingValues ?? [];
    const explicitlyMissingValueIds = new Set(explicitMissing.map((value) => value.valueId));
    const observedVerified = new Set((input.observedValues ?? [])
        .filter((value) => value.confidence === "verified")
        .map((value) => value.valueId));
    const derivedMissing = (input.requiredValues ?? [])
        .filter((value) => value.required &&
        !observedVerified.has(value.valueId) &&
        !explicitlyMissingValueIds.has(value.valueId))
        .map((value) => ({
        valueId: value.valueId,
        label: value.label,
        reasonCode: "required_value_not_observed",
    }));
    const byKey = new Map();
    for (const item of [...explicitMissing, ...derivedMissing]) {
        byKey.set(`${item.valueId}:${item.reasonCode}`, item);
    }
    return [...byKey.values()];
}
function currentFactSourceIssues(input) {
    if (input.mode !== "current_fact")
        return [];
    const issues = [];
    const sourceIds = new Set((input.sourceList ?? []).map((source) => source.sourceId));
    for (const value of input.observedValues ?? []) {
        if (value.confidence !== "verified")
            continue;
        if (!value.sourceId && !value.sourceUrl && !value.sourceDomain && !value.sourceLabel) {
            issues.push(`missing_source_reference:${value.valueId}`);
            continue;
        }
        if (value.sourceId && sourceIds.size > 0 && !sourceIds.has(value.sourceId)) {
            issues.push(`source_not_in_trace:${value.valueId}:${value.sourceId}`);
        }
        if (!value.sourceTimestamp && !value.fetchTimestamp && !value.basisTime && !input.basisTime) {
            issues.push(`missing_basis_time:${value.valueId}`);
        }
    }
    if ((input.observedValues ?? []).some((value) => value.confidence === "verified") && (input.sourceList ?? []).length === 0) {
        issues.push("missing_source_list");
    }
    return uniqueStrings(issues);
}
export function validateAndFinalize(input) {
    const requiredValues = input.requiredValues ?? [];
    const observedValues = input.observedValues ?? [];
    const missingValues = deriveMissingRequiredValues(input);
    const sourceList = input.sourceList ?? [];
    const observedSourceTimestamps = observedValues.flatMap((value) => [
        value.sourceTimestamp ?? undefined,
        value.fetchTimestamp ?? undefined,
        value.basisTime ?? undefined,
    ]);
    const sourceTimestamps = uniqueStrings([
        ...(input.sourceTimestamps ?? []),
        ...sourceList.flatMap((source) => [source.sourceTimestamp ?? undefined, source.fetchTimestamp ?? undefined]),
        ...observedSourceTimestamps,
        input.basisTime ?? undefined,
    ]);
    const observedConflicts = observedValues.flatMap((value) => (value.conflicts ?? []).map((summary) => ({
        valueId: value.valueId,
        summary,
        ...(value.sourceId ? { sourceIds: [value.sourceId] } : {}),
    })));
    const conflicts = [...(input.conflicts ?? []), ...observedConflicts];
    const sourceIssues = currentFactSourceIssues(input);
    const safeAlternativesExhausted = input.safeAlternativesExhausted === true;
    const hasValidationIssue = missingValues.length > 0 || conflicts.length > 0 || sourceIssues.length > 0;
    const recoveryAvailable = input.recoveryAvailable === true || (hasValidationIssue && !safeAlternativesExhausted);
    const baseReasonCodes = uniqueStrings([
        ...(input.reasonCodes ?? []),
        ...missingValues.map((value) => value.reasonCode),
        ...conflicts.map(() => "source_conflict"),
        ...sourceIssues,
    ]);
    let status = "ready";
    let finalDeliveryAllowed = true;
    const needsRecovery = recoveryAvailable &&
        hasValidationIssue;
    if (needsRecovery) {
        status = "needs_recovery";
        finalDeliveryAllowed = false;
    }
    else if (hasValidationIssue) {
        status = "limited_failure_allowed";
    }
    const reasonCodes = uniqueStrings([
        ...baseReasonCodes,
        status === "ready" ? "final_validation_ready" : undefined,
        status === "needs_recovery" ? "final_validation_requires_recovery" : undefined,
        status === "limited_failure_allowed" ? "safe_alternatives_exhausted" : undefined,
    ]);
    const trace = {
        mode: input.mode,
        validationScope: input.validationScope ?? "parent_finalizer",
        requiredValues,
        observedValues,
        missingValues,
        sourceList,
        sourceTimestamps,
        conflicts,
        reasonCodes,
        ...(input.basisTime ? { basisTime: input.basisTime } : {}),
        recoveryAvailable,
        safeAlternativesExhausted,
    };
    const summary = finalDeliveryAllowed
        ? status === "ready"
            ? "최종 검증을 통과했습니다."
            : "안전한 대체 경로가 소진되어 제한된 최종 설명을 허용합니다."
        : "필수 값, 출처, 충돌 검증이 끝나지 않아 최종 전달을 보류합니다.";
    return {
        status,
        finalDeliveryAllowed,
        reasonCodes,
        summary,
        trace,
    };
}
export class ValidateAndFinalize {
    decide(input) {
        return validateAndFinalize(input);
    }
}
function recordFinalValidationEvaluation(params) {
    recordMessageLedgerEvent({
        runId: params.runId,
        sessionKey: params.sessionId,
        channel: params.source,
        eventKind: "final_validation_evaluated",
        deliveryKind: "final",
        idempotencyKey: `final-validation:${params.runId}:${params.decision.status}`,
        status: params.decision.finalDeliveryAllowed ? "succeeded" : "pending",
        summary: params.decision.summary,
        detail: {
            status: params.decision.status,
            finalDeliveryAllowed: params.decision.finalDeliveryAllowed,
            reasonCodes: params.decision.reasonCodes,
            trace: params.decision.trace,
        },
    });
}
export function markRunCompleted(params) {
    const executingSummary = params.executingSummary ?? params.text ?? "응답 생성을 마쳤습니다.";
    const completedSummary = params.completedSummary ?? params.text ?? "실행을 완료했습니다.";
    params.dependencies.rememberRunSuccess({
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        text: params.text,
        summary: params.summary,
    });
    params.dependencies.setRunStepStatus(params.runId, "executing", "completed", executingSummary);
    params.dependencies.setRunStepStatus(params.runId, "reviewing", "completed", params.reviewingSummary ?? params.summary);
    params.dependencies.setRunStepStatus(params.runId, "finalizing", "completed", params.finalizingSummary ?? "실행 결과를 저장했습니다.");
    params.dependencies.setRunStepStatus(params.runId, "completed", "completed", completedSummary);
    params.dependencies.updateRunStatus(params.runId, "completed", completedSummary, false);
    params.dependencies.appendRunEvent(params.runId, params.eventLabel ?? "실행 완료");
}
export async function completeRunWithAssistantMessage(params) {
    let terminalReportFingerprint;
    let terminalReportBinding;
    let finalResponseRawText = params.text;
    if (terminalReportRequired(params.canonicalFinalOutcome)) {
        if (!params.terminalReport || !params.canonicalFinalOutcome) {
            params.dependencies.appendRunEvent(params.runId, "canonical_terminal_report_rejected:terminal_report_missing");
            return { status: "blocked_by_canonical_delivery" };
        }
        const binding = bindTerminalReportForDelivery({
            runId: params.runId,
            finalOutcome: params.canonicalFinalOutcome,
            facts: params.terminalReport,
            draftText: params.text,
        });
        if (!binding.ok) {
            params.dependencies.appendRunEvent(params.runId, `canonical_terminal_report_rejected:${binding.reasonCode}`);
            return { status: "blocked_by_canonical_delivery" };
        }
        terminalReportFingerprint = binding.reportFingerprint;
        terminalReportBinding = binding;
        finalResponseRawText = binding.reviewInput;
    }
    if (params.finalValidation) {
        const finalValidation = validateAndFinalize(params.finalValidation);
        recordFinalValidationEvaluation({
            runId: params.runId,
            sessionId: params.sessionId,
            source: params.source,
            decision: finalValidation,
        });
        if (!finalValidation.finalDeliveryAllowed) {
            params.dependencies.setRunStepStatus(params.runId, "reviewing", "running", finalValidation.summary);
            params.dependencies.setRunStepStatus(params.runId, "finalizing", "pending", "최종 전달 전 검증이 보류되었습니다.");
            params.dependencies.updateRunStatus(params.runId, "running", finalValidation.summary, true);
            params.dependencies.appendRunEvent(params.runId, `final_validation_blocked:${finalValidation.reasonCodes.join("+")}`);
            return { status: "blocked_by_final_validation", finalValidation };
        }
        params.dependencies.appendRunEvent(params.runId, `final_validation_${finalValidation.status}:${finalValidation.reasonCodes.join("+")}`);
    }
    let completionText = finalResponseRawText;
    let completionResponseReview;
    const completionTextSource = params.textSource ?? "runtime_deterministic";
    if (finalResponseRawText.trim() && !params.suppressFinalDelivery) {
        params.dependencies.appendRunEvent(params.runId, `user_facing_completion_text_source:${completionTextSource}`);
        const authorizedDirectReview = params.preauthorizedResponseReview
            ? authorizeUserFacingResponse({
                rawText: params.preauthorizedResponseReview.rawText,
                responseText: finalResponseRawText,
                rawTextSource: params.preauthorizedResponseReview.rawTextSource,
                contentKind: params.preauthorizedResponseReview.contentKind,
                expectedLanguage: params.preauthorizedResponseReview.expectedLanguage,
                receipt: params.preauthorizedResponseReview.receipt,
            })
            : undefined;
        if (params.preauthorizedResponseReview && !authorizedDirectReview?.ok) {
            const reasonCode = authorizedDirectReview?.reasonCode ?? "review_receipt_missing";
            params.dependencies.appendRunEvent(params.runId, `user_facing_completion_blocked:${reasonCode}`);
            return { status: "blocked_by_final_response_rendering" };
        }
        let completionResolution = params.preauthorizedResponseReview && authorizedDirectReview?.ok
            ? {
                status: "ready",
                text: finalResponseRawText,
                responseReview: params.preauthorizedResponseReview,
            }
            : await resolveCompletionAssistantText({
                runId: params.runId,
                text: finalResponseRawText,
                textSource: completionTextSource,
                ...(terminalReportFingerprint ? { contentKind: "final_report" } : {}),
                responseContext: params.responseContext,
                appendRunEvent: params.dependencies.appendRunEvent,
                renderFinalResponseText: params.renderFinalResponseText ?? renderFinalResponseTextDefault,
            });
        if (completionResolution.status === "blocked") {
            const summary = "최종 응답을 LLM으로 렌더링하지 못해 사용자 전달을 중단했습니다.";
            params.dependencies.setRunStepStatus(params.runId, "reviewing", "completed", "결과 검토를 마쳤습니다.");
            params.dependencies.setRunStepStatus(params.runId, "finalizing", "failed", summary);
            params.dependencies.updateRunStatus(params.runId, "failed", summary, false);
            params.dependencies.rememberRunFailure({
                runId: params.runId,
                sessionId: params.sessionId,
                source: params.source,
                summary,
                detail: completionResolution.detail ?? completionResolution.reasonCode,
                title: "final_response_rendering_blocked",
            });
            params.dependencies.appendRunEvent(params.runId, `user_facing_completion_blocked:${completionResolution.reasonCode}`);
            return {
                status: "blocked_by_final_response_rendering",
                ...(params.finalValidation ? { finalValidation: validateAndFinalize(params.finalValidation) } : {}),
            };
        }
        if (terminalReportBinding) {
            let semanticReview = reviewTerminalReportResponse({
                facts: terminalReportBinding.facts,
                responseText: completionResolution.text,
            });
            if (!semanticReview.ok) {
                const repairReasonCode = semanticReview.missingFields.join("+");
                params.dependencies.appendRunEvent(params.runId, `canonical_terminal_report_response_repair_requested:${repairReasonCode}`);
                const reviewInput = JSON.parse(terminalReportBinding.reviewInput);
                const repairResolution = await resolveCompletionAssistantText({
                    runId: params.runId,
                    text: JSON.stringify({
                        ...reviewInput,
                        reviewFeedback: {
                            reasonCode: "canonical_terminal_report_fields_missing",
                            missingFields: semanticReview.missingFields,
                            missingRequiredFragments: semanticReview.missingRequiredFragments,
                            instruction: "Regenerate the final report. Include every missingRequiredFragments value exactly once without paraphrasing it.",
                        },
                    }),
                    textSource: completionTextSource,
                    contentKind: "final_report",
                    responseContext: params.responseContext,
                    appendRunEvent: params.dependencies.appendRunEvent,
                    renderFinalResponseText: params.renderFinalResponseText ?? renderFinalResponseTextDefault,
                });
                if (repairResolution.status === "ready") {
                    completionResolution = repairResolution;
                    semanticReview = reviewTerminalReportResponse({
                        facts: terminalReportBinding.facts,
                        responseText: completionResolution.text,
                    });
                }
            }
            if (!semanticReview.ok) {
                const reasonCode = semanticReview.missingFields.join("+");
                const summary = "최종 실패 보고서가 canonical fact 보존 계약을 충족하지 못했습니다.";
                params.dependencies.setRunStepStatus(params.runId, "reviewing", "completed", "결과 검토를 마쳤습니다.");
                params.dependencies.setRunStepStatus(params.runId, "finalizing", "failed", summary);
                params.dependencies.updateRunStatus(params.runId, "failed", summary, false);
                params.dependencies.rememberRunFailure({
                    runId: params.runId,
                    sessionId: params.sessionId,
                    source: params.source,
                    summary,
                    detail: reasonCode,
                    title: "terminal_report_rendering_blocked",
                });
                params.dependencies.appendRunEvent(params.runId, `canonical_terminal_report_response_rejected:${reasonCode}`);
                return { status: "blocked_by_final_response_rendering" };
            }
        }
        completionText = completionResolution.text;
        completionResponseReview = completionResolution.responseReview;
    }
    if (params.text && params.suppressFinalDelivery) {
        const reasonCode = params.suppressFinalDeliveryReasonCode ?? "child_result_parent_aggregation_required";
        recordMessageLedgerEvent({
            runId: params.runId,
            sessionKey: params.sessionId,
            channel: params.source,
            eventKind: "final_answer_suppressed",
            deliveryKind: "final",
            deliveryKey: `final-suppressed:${params.runId}`,
            idempotencyKey: `final-answer-suppressed:${params.runId}:${reasonCode}`,
            status: "suppressed",
            summary: "하위 실행의 최종 채널 응답을 차단하고 상위 검증/취합으로 넘겼습니다.",
            detail: {
                reasonCode,
                textLength: params.text.trim().length,
                parentAggregationRequired: true,
            },
        });
        params.dependencies.appendRunEvent(params.runId, `child_final_delivery_suppressed:${reasonCode}`);
    }
    else if (completionText) {
        if (params.recordCanonicalDelivery && params.stageCanonicalPendingResponse) {
            if (!params.canonicalFinalOutcome) {
                params.dependencies.appendRunEvent(params.runId, "canonical_pending_response_rejected:final_outcome_missing");
                return { status: "blocked_by_canonical_delivery" };
            }
            if (!completionResponseReview || typeof completionResponseReview.rawText !== "string") {
                params.dependencies.appendRunEvent(params.runId, "canonical_pending_response_rejected:review_envelope_missing");
                return { status: "blocked_by_canonical_delivery" };
            }
            const staged = await params.stageCanonicalPendingResponse({
                runId: params.runId,
                workId: canonicalWorkIdForRootRun(params.runId),
                sessionId: params.sessionId,
                source: params.source,
                text: completionText,
                textSource: completionTextSource,
                finalOutcome: params.canonicalFinalOutcome,
                reviewEnvelope: buildCanonicalPendingResponseReviewEnvelope(completionResponseReview, terminalReportFingerprint),
            });
            if (!staged.ok) {
                params.dependencies.appendRunEvent(params.runId, `canonical_pending_response_rejected:${staged.reasonCode}`);
                return { status: "blocked_by_canonical_delivery" };
            }
        }
        const finalDelivery = await commitFinalDelivery({
            parentRunId: params.runId,
            sessionId: params.sessionId,
            text: completionText,
            source: params.source,
            onChunk: params.onChunk,
            ...(params.responseContext?.identityContext?.mainAgentSelfName
                ? { rootAgentNameSnapshot: params.responseContext.identityContext.mainAgentSelfName }
                : {}),
            ...(params.speaker ? { speaker: params.speaker } : {}),
            ...(params.dependencies.onDeliveryError
                ? { onDeliveryError: params.dependencies.onDeliveryError }
                : {}),
            ...(params.dependencies.deliveryDependencies
                ? { deliveryDependencies: params.dependencies.deliveryDependencies }
                : {}),
            ...(params.dependencies.firstResponseMonotonicNow
                ? { monotonicNow: params.dependencies.firstResponseMonotonicNow }
                : {}),
            ...(completionResponseReview
                ? { responseReview: completionResponseReview }
                : {}),
            ...(params.cancellationReportAuthorization
                ? { cancellationReportAuthorization: params.cancellationReportAuthorization }
                : {}),
        });
        if (finalDelivery.deliveryOutcome?.hasDeliveryFailure) {
            params.dependencies.appendRunEvent(params.runId, describeAssistantTextDeliveryFailure({
                source: params.source,
                outcome: finalDelivery.deliveryOutcome,
            }));
        }
        if (finalDelivery.status !== "delivered" && finalDelivery.status !== "duplicate_suppressed") {
            params.dependencies.setRunStepStatus(params.runId, "finalizing", "failed", "최종 응답 전달이 완료되지 않았습니다.");
            params.dependencies.updateRunStatus(params.runId, "running", "최종 응답 전달을 완료하지 못했습니다.", true);
            params.dependencies.appendRunEvent(params.runId, `canonical_delivery_blocked:${finalDelivery.reasonCodes.join("+") || finalDelivery.status}`);
            return { status: "blocked_by_delivery" };
        }
        recordFirstResponseFromFinalDelivery(finalDelivery, params.dependencies.recordFirstResponseReceipt);
        if (params.recordCanonicalDelivery) {
            if (!params.canonicalFinalOutcome) {
                params.dependencies.appendRunEvent(params.runId, "canonical_delivery_descriptor_rejected:final_outcome_missing");
                return { status: "blocked_by_canonical_delivery" };
            }
            const built = buildCanonicalDeliveryDescriptor({
                runId: params.runId,
                source: params.source,
                sessionId: params.sessionId,
                text: completionText,
                textSource: completionTextSource,
                finalOutcome: params.canonicalFinalOutcome,
                delivery: finalDelivery,
            });
            if (!built.ok) {
                params.dependencies.appendRunEvent(params.runId, `canonical_delivery_descriptor_rejected:${built.reasonCode}`);
                return { status: "blocked_by_canonical_delivery" };
            }
            const recorded = await params.recordCanonicalDelivery(built.descriptor);
            if (!recorded.ok) {
                params.dependencies.appendRunEvent(params.runId, `canonical_delivery_transition_rejected:${recorded.reasonCode}`);
                return { status: "blocked_by_canonical_delivery" };
            }
            if (params.consumeCanonicalPendingResponse) {
                const consumed = await params.consumeCanonicalPendingResponse(params.runId);
                if (!consumed.ok) {
                    params.dependencies.appendRunEvent(params.runId, `canonical_pending_response_consume_deferred:${consumed.reasonCode}`);
                }
            }
        }
    }
    if (params.recordCanonicalDelivery && !completionText.trim()) {
        params.dependencies.appendRunEvent(params.runId, "canonical_delivery_blocked:empty_final_text");
        return { status: "blocked_by_canonical_delivery" };
    }
    const fallbackText = completionText || "실행을 완료했습니다.";
    if (params.preserveRunStatusAfterDelivery) {
        return {
            status: "completed",
            ...(params.finalValidation ? { finalValidation: validateAndFinalize(params.finalValidation) } : {}),
        };
    }
    markRunCompleted({
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        text: completionText,
        summary: fallbackText,
        reviewingSummary: completionText || "응답을 정리했습니다.",
        dependencies: params.dependencies,
    });
    return { status: "completed", ...(params.finalValidation ? { finalValidation: validateAndFinalize(params.finalValidation) } : {}) };
}
export async function emitStandaloneAssistantMessage(params) {
    if (!params.text.trim())
        return;
    const textSource = params.textSource ?? "runtime_deterministic";
    params.dependencies.appendRunEvent(params.runId, `user_facing_standalone_text_source:${textSource}`);
    if (params.notice) {
        params.dependencies.appendRunEvent(params.runId, `user_facing_standalone_notice:${params.notice.textSource}:non_final`);
    }
    const deliveryResolution = await resolveStandaloneAssistantText({
        runId: params.runId,
        text: params.text,
        textSource,
        contentKind: params.notice?.contentKind ?? "fixed_notice",
        responseContext: params.responseContext,
        appendRunEvent: params.dependencies.appendRunEvent,
        renderFinalResponseText: params.renderFinalResponseText ?? renderFinalResponseTextDefault,
    });
    if (deliveryResolution.status === "blocked") {
        params.dependencies.appendRunEvent(params.runId, `user_facing_standalone_delivery_blocked:${deliveryResolution.reasonCode}`);
        return;
    }
    const responseReview = deliveryResolution.responseReview;
    if (!responseReview || typeof responseReview.rawText !== "string") {
        params.dependencies.appendRunEvent(params.runId, "user_facing_standalone_delivery_blocked:review_receipt_missing");
        return;
    }
    const authorization = authorizeUserFacingResponse({
        rawText: responseReview.rawText,
        responseText: deliveryResolution.text,
        rawTextSource: responseReview.rawTextSource,
        contentKind: responseReview.contentKind,
        expectedLanguage: responseReview.expectedLanguage,
        receipt: responseReview.receipt,
    });
    if (!authorization.ok) {
        params.dependencies.appendRunEvent(params.runId, `user_facing_standalone_delivery_blocked:${authorization.reasonCode ?? "review_receipt_missing"}`);
        return;
    }
    const deliveryText = sanitizeCompletionAwaitingUserText(deliveryResolution.text);
    const deliveryReceipt = await emitAssistantTextDelivery({
        runId: params.runId,
        sessionId: params.sessionId,
        text: deliveryText,
        source: params.source,
        onChunk: params.onChunk,
        deliveryKind: "progress",
        ...(params.dependencies.onDeliveryError
            ? { onError: params.dependencies.onDeliveryError }
            : {}),
        ...(params.dependencies.deliveryDependencies
            ? { dependencies: params.dependencies.deliveryDependencies }
            : {}),
    });
    const deliveryOutcome = resolveAssistantTextDeliveryOutcome(deliveryReceipt);
    if (deliveryOutcome.hasDeliveryFailure) {
        params.dependencies.appendRunEvent(params.runId, describeAssistantTextDeliveryFailure({ source: params.source, outcome: deliveryOutcome }));
    }
}
export async function moveRunToAwaitingUser(params) {
    const message = buildAwaitingUserMessage(params.awaitingUser);
    const textSource = params.textSource ?? "runtime_deterministic";
    if (message) {
        await emitStandaloneAssistantMessage({
            runId: params.runId,
            sessionId: params.sessionId,
            text: message,
            textSource,
            notice: buildTerminalControlNotice({
                terminalKind: "awaiting_user",
                messageSource: textSource,
            }),
            ...(params.responseContext ? { responseContext: params.responseContext } : {}),
            source: params.source,
            onChunk: params.onChunk,
            dependencies: params.dependencies,
        });
    }
    const summary = params.awaitingUser.summary || "추가 입력이 필요해 자동 진행을 멈췄습니다.";
    params.dependencies.setRunStepStatus(params.runId, "reviewing", "completed", summary);
    params.dependencies.setRunStepStatus(params.runId, "awaiting_user", "running", summary);
    params.dependencies.updateRunStatus(params.runId, "awaiting_user", summary, true);
    params.dependencies.rememberRunAwaitingUser?.({
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        summary,
        ...(params.awaitingUser.reason ? { reason: params.awaitingUser.reason } : {}),
        ...(params.awaitingUser.userMessage ? { userMessage: params.awaitingUser.userMessage } : {}),
        ...(params.awaitingUser.remainingItems
            ? { remainingItems: params.awaitingUser.remainingItems }
            : {}),
    });
    params.dependencies.appendRunEvent(params.runId, "사용자 추가 입력 대기");
}
export async function moveRunToCancelledAfterStop(params) {
    const message = buildAwaitingUserMessage(params.cancellation);
    const textSource = params.textSource ?? "runtime_deterministic";
    recordMessageLedgerEvent({
        runId: params.runId,
        sessionKey: params.sessionId,
        channel: params.source,
        eventKind: "recovery_stop_generated",
        idempotencyKey: `recovery-stop:${params.runId}:${params.cancellation.reason ?? params.cancellation.summary}`,
        status: "suppressed",
        summary: params.cancellation.summary || "자동 진행 중단 안내를 생성했습니다.",
        detail: {
            reason: params.cancellation.reason ?? null,
            remainingItems: params.cancellation.remainingItems ?? [],
        },
    });
    if (message && params.recordCanonicalDelivery) {
        const outcome = await completeRunWithAssistantMessage({
            runId: params.runId,
            sessionId: params.sessionId,
            text: message,
            textSource,
            ...(params.responseContext ? { responseContext: params.responseContext } : {}),
            source: params.source,
            onChunk: params.onChunk,
            recordCanonicalDelivery: params.recordCanonicalDelivery,
            canonicalFinalOutcome: params.canonicalFinalOutcome ?? "exhausted",
            ...(params.terminalReport ? { terminalReport: params.terminalReport } : {}),
            preserveRunStatusAfterDelivery: true,
            dependencies: params.dependencies,
        });
        if (outcome.status !== "completed") {
            params.dependencies.appendRunEvent(params.runId, `canonical_stop_delivery_blocked:${outcome.status}`);
            return;
        }
    }
    else if (message) {
        await emitStandaloneAssistantMessage({
            runId: params.runId,
            sessionId: params.sessionId,
            text: message,
            textSource,
            notice: buildTerminalControlNotice({
                terminalKind: "stop",
                messageSource: textSource,
            }),
            ...(params.responseContext ? { responseContext: params.responseContext } : {}),
            source: params.source,
            onChunk: params.onChunk,
            dependencies: params.dependencies,
        });
    }
    const summary = params.cancellation.summary || "자동 진행을 중단하고 요청을 취소했습니다.";
    params.dependencies.rememberRunFailure({
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        summary,
        detail: buildCancelledAfterStopDetail(params.cancellation),
        title: params.canonicalFinalOutcome === "blocked"
            || params.canonicalFinalOutcome === "exhausted"
            ? "verified_failure_after_stop"
            : "cancelled_after_stop",
    });
    params.dependencies.setRunStepStatus(params.runId, "reviewing", "completed", summary);
    params.dependencies.setRunStepStatus(params.runId, "finalizing", "completed", "중단 결과를 사용자에게 안내했습니다.");
    if (params.recordCanonicalDelivery
        && (params.canonicalFinalOutcome === "blocked"
            || params.canonicalFinalOutcome === "exhausted")) {
        params.dependencies.appendRunEvent(params.runId, "검증된 경로 소진 후 사용자 보고 완료");
        return;
    }
    params.dependencies.updateRunStatus(params.runId, "cancelled", summary, false);
    params.dependencies.appendRunEvent(params.runId, "자동 진행 중단 후 요청 취소");
}
export function buildAwaitingUserMessage(params) {
    const remainingItems = params.remainingItems?.filter((item) => item.trim()) ?? [];
    const lines = [
        params.userMessage?.trim() || params.summary.trim(),
        params.preview.trim() ? `현재까지 결과:\n${params.preview.trim()}` : "",
        remainingItems.length > 0 ? `남은 항목:\n- ${remainingItems.join("\n- ")}` : "",
        params.reason?.trim() ? `중단 사유: ${params.reason.trim()}` : "",
        summarizeRawErrorForUser(params.rawMessage)
            ? `오류 세부:\n${summarizeRawErrorForUser(params.rawMessage)}`
            : "",
        summarizeRawErrorActionHintForUser(params.rawMessage)
            ? `권장 조치:\n${summarizeRawErrorActionHintForUser(params.rawMessage)}`
            : "",
    ].filter(Boolean);
    return lines.join("\n\n");
}
function buildCancelledAfterStopDetail(params) {
    return [
        params.reason,
        params.rawMessage,
        params.userMessage,
        params.preview,
        params.remainingItems?.join("\n"),
    ]
        .filter(Boolean)
        .join("\n");
}
//# sourceMappingURL=finalization.js.map