export function createYeonjangExecutionAuthorizationIssuer(input) {
    const issuer = input.issuer.trim();
    const now = input.now ?? Date.now;
    return Object.freeze({
        issue: (request) => {
            const extensionId = request.extensionId.trim();
            const targetSessionId = request.targetSessionId.trim();
            const method = request.method.trim();
            const resourceScope = request.resourceScope.trim();
            const commandId = request.commandId.trim();
            const operationId = request.operationId.trim();
            const targetFingerprint = request.targetFingerprint.trim().toLowerCase();
            const idempotencyKey = request.idempotencyKey.trim();
            const approvalId = request.grant.approvalId.trim();
            const permissionScope = request.grant.permissionScope.trim();
            const authorizationNonce = input.createAuthorizationId().trim();
            const authorizationId = `${approvalId}:${authorizationNonce}`;
            if (!issuer
                || !extensionId
                || !targetSessionId
                || !method
                || !resourceScope
                || !commandId
                || !operationId
                || !/^sha256:[a-f0-9]{64}$/u.test(targetFingerprint)
                || !idempotencyKey
                || !approvalId
                || !permissionScope
                || !authorizationNonce
                || authorizationId.length > 256
                || permissionScope.length > 256
                || (request.grant.decision !== "allow_once"
                    && request.grant.decision !== "allow_run")
                || !Number.isSafeInteger(request.expiresAt)) {
                return { ok: false, reasonCode: "execution_authorization_input_invalid" };
            }
            if (request.expiresAt <= now()) {
                return { ok: false, reasonCode: "execution_authorization_expired" };
            }
            const key = input.keyPort.resolve({
                extensionId,
                sessionId: targetSessionId,
            });
            if (!key
                || key.extensionId.trim() !== extensionId
                || (key.sessionId?.trim() && key.sessionId.trim() !== targetSessionId)
                || !key.keyId.trim()) {
                return { ok: false, reasonCode: "execution_authorization_key_unavailable" };
            }
            const unsigned = {
                schemaVersion: 1,
                authorizationId,
                issuer,
                issuerKeyId: key.keyId.trim(),
                audience: extensionId,
                method,
                resourceScope,
                commandId,
                operationId,
                targetSessionId,
                targetFingerprint,
                idempotencyKey,
                expiresAt: request.expiresAt,
            };
            const signed = key.sign({
                canonicalPayload: canonicalizeYeonjangAuthorizationReceipt(unsigned),
            });
            const proof = signed.startsWith("hmac-sha256:")
                ? signed.slice("hmac-sha256:".length)
                : "";
            if (!/^[a-f0-9]{64}$/u.test(proof)) {
                return { ok: false, reasonCode: "execution_authorization_proof_invalid" };
            }
            return { ok: true, receipt: Object.freeze({ ...unsigned, proof }) };
        },
    });
}
export function canonicalizeYeonjangAuthorizationReceipt(input) {
    return [
        input.schemaVersion.toString(),
        input.authorizationId,
        input.issuer,
        input.issuerKeyId,
        input.audience,
        input.method,
        input.resourceScope,
        input.commandId,
        input.operationId,
        input.targetSessionId,
        input.targetFingerprint,
        input.idempotencyKey,
        input.expiresAt.toString(),
    ]
        .map((value) => `${Buffer.byteLength(value, "utf8")}:${value}`)
        .join("");
}
//# sourceMappingURL=execution-authorization-receipt.js.map