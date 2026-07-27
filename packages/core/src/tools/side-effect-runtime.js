import { createHash } from "node:crypto";
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js";
import { buildSideEffectOperationAuthorization, buildSideEffectOperationIdentity, buildSideEffectOperationReceipt, } from "../contracts/side-effect-operation.js";
import { getDb } from "../db/index.js";
import { SqliteSideEffectOperationRepository } from "../db/side-effect-operation-repository.js";
import { executeSideEffectOperation } from "../runs/side-effect-operation-executor.js";
function stable(value) {
    if (Array.isArray(value))
        return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}
function fingerprint(value) {
    return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}
export async function executeToolWithSideEffectLedger(input) {
    const contract = input.tool.sideEffect;
    if (!contract)
        return input.tool.execute(input.params, input.ctx);
    const policy = input.ctx.authorizationReceipt;
    const targetRef = contract.targetRef(input.params, input.ctx);
    const paramsFingerprint = fingerprint(input.params);
    const identity = buildSideEffectOperationIdentity({
        runId: input.ctx.runId,
        workId: canonicalWorkIdForRootRun(input.ctx.runId),
        stepKey: "executing",
        adapterId: `tool:${input.tool.name}`,
        targetFingerprint: fingerprint(targetRef),
        paramsFingerprint,
    });
    const authorization = policy &&
        policy.policyDecision === "allow" &&
        policy.runId === input.ctx.runId &&
        policy.toolName === input.tool.name &&
        `sha256:${policy.paramsHash}` === paramsFingerprint
        ? buildSideEffectOperationAuthorization({
            identity,
            policyDecisionId: policy.policyDecisionId,
            policyReceiptRef: `tool-policy:${policy.policyDecisionId}`,
            effectClass: contract.effectClass,
            scopeFingerprint: fingerprint(policy.permissionScope),
            expectedEffectFingerprint: fingerprint(contract.expectedState(input.params, input.ctx)),
        })
        : undefined;
    const repository = new SqliteSideEffectOperationRepository(getDb(), () => Date.now());
    const result = await executeSideEffectOperation({
        identity,
        compensationSupport: contract.compensationSupport,
        executeEffect: async () => {
            const value = await input.tool.execute(input.params, input.ctx);
            return {
                value,
                success: value.success,
                resultFingerprint: fingerprint({
                    success: value.success,
                    output: value.output,
                    error: value.error ?? null,
                    details: value.details ?? null,
                }),
                recordedAt: Date.now(),
            };
        },
        observePostState: async (value) => {
            const observation = await contract.observe(input.params, input.ctx, value);
            return {
                available: observation.available,
                targetFingerprint: fingerprint(observation.targetRef),
                expectedStateFingerprint: fingerprint(observation.expectedState),
                observedStateFingerprint: fingerprint(observation.observedState),
                capturedAt: Date.now(),
            };
        },
        ...(contract.observeCurrent
            ? {
                observeCurrentPostState: async () => {
                    const observation = await contract.observeCurrent?.(input.params, input.ctx);
                    return {
                        available: observation?.available ?? false,
                        targetFingerprint: fingerprint(observation?.targetRef ?? targetRef),
                        expectedStateFingerprint: fingerprint(observation?.expectedState ?? null),
                        observedStateFingerprint: fingerprint(observation?.observedState ?? null),
                        capturedAt: Date.now(),
                    };
                },
            }
            : {}),
        ...(contract.compensate
            ? {
                compensate: async (value) => {
                    const compensation = await contract.compensate?.(input.params, input.ctx, value);
                    return {
                        success: compensation?.success ?? false,
                        receiptEvidence: compensation?.evidence ?? null,
                    };
                },
            }
            : {}),
        ...(contract.verifyCompensation
            ? {
                verifyCompensation: async () => {
                    const verification = await contract.verifyCompensation?.(input.params, input.ctx);
                    return {
                        verified: verification?.verified ?? false,
                        receiptEvidence: verification?.evidence ?? null,
                    };
                },
            }
            : {}),
    }, {
        repository,
        ...(authorization ? { authorization } : {}),
        createReceipt: ({ identity: receiptIdentity, event, operationRevision, evidence }) => {
            const evidenceFingerprint = fingerprint(evidence);
            return buildSideEffectOperationReceipt({
                identity: receiptIdentity,
                event,
                operationRevision,
                evidenceFingerprint,
                evidenceRefs: event === "START_EFFECT" && authorization
                    ? [authorization.policyReceiptRef]
                    : [`operation-evidence:${event.toLowerCase()}:${evidenceFingerprint.slice(-24)}`],
                issuedAt: Date.now(),
            });
        },
        isCancelled: () => input.ctx.signal.aborted,
    });
    switch (result.status) {
        case "verified":
            return result.value;
        case "duplicate_verified":
        case "resumed_verified":
            return {
                success: true,
                output: `${input.tool.name}의 동일한 검증 완료 작업이 있어 외부 변경을 다시 실행하지 않았습니다.`,
                details: { kind: "side_effect_duplicate_verified", operationId: identity.operationId },
            };
        case "cancelled_before_effect":
            return {
                success: false,
                output: "취소 요청으로 외부 변경을 시작하지 않았습니다.",
                error: "SIDE_EFFECT_CANCELLED_BEFORE_EXECUTION",
            };
        case "compensated":
            return {
                success: false,
                output: "외부 변경 검증에 실패해 원상 복구했습니다.",
                error: "SIDE_EFFECT_COMPENSATED",
            };
        case "manual_intervention":
            return {
                success: false,
                output: "외부 변경 결과를 검증하거나 자동 복구할 수 없습니다.",
                error: "SIDE_EFFECT_MANUAL_INTERVENTION",
                details: {
                    kind: "side_effect_manual_intervention",
                    operationId: identity.operationId,
                    reasonCode: result.reasonCode,
                    goalValidationCandidate: true,
                },
            };
        case "blocked":
            return {
                success: false,
                output: "동일 외부 변경 작업의 안전한 실행 상태를 확인할 수 없습니다.",
                error: "SIDE_EFFECT_OPERATION_BLOCKED",
                details: { reasonCode: result.reasonCode },
            };
    }
}
//# sourceMappingURL=side-effect-runtime.js.map