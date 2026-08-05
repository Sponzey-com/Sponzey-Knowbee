import { createHash } from "node:crypto";
import { executeCapabilityMutation, projectCapabilityMutationReceipt, } from "../capabilities/capability-mutation-state-machine.js";
import { validateMutationEnvelope, } from "../capabilities/capability-security-boundary.js";
import { toCanonicalJson } from "../contracts/index.js";
export const AGENT_OPERATIONAL_SETTINGS_WRITE_OWNER = "agent_operational_settings_command_v1";
export function projectAgentOperationalSettingsMutationLog(level, receipt) {
    const base = {
        level,
        event: "agent_operational_settings_mutation",
        kind: receipt.kind,
        state: receipt.state,
        reasonCode: receipt.reasonCode,
        revision: receipt.revision,
    };
    if (level === "product")
        return base;
    if (level === "field_debug")
        return { ...base, mutationId: receipt.mutationId, agentRef: receipt.agentRef };
    return {
        ...base,
        mutationId: receipt.mutationId,
        agentRef: receipt.agentRef,
        allowedActions: receipt.allowedActions,
    };
}
const RISK_ORDER = {
    safe: 0,
    moderate: 1,
    external: 2,
    sensitive: 3,
    dangerous: 4,
};
const AGENT_REF_PATTERN = /^agent_v1_[a-f0-9]{24}$/u;
function fingerprint(command) {
    return createHash("sha256")
        .update(JSON.stringify([
        command.kind,
        command.agentRef,
        command.envelope.targetRevision,
        "value" in command ? command.value : null,
    ]))
        .digest("hex");
}
function rejected(input) {
    return {
        mutationId: input.command.envelope.mutationId,
        kind: input.command.kind,
        state: input.state ?? "rejected",
        reasonCode: input.reasonCode,
        revision: input.revision,
        agentRef: input.command.agentRef,
        allowedActions: [],
    };
}
function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
function deniedFields(value, fields) {
    const input = record(value);
    return fields.some((field) => Object.hasOwn(input, field));
}
function modelValid(command) {
    if (deniedFields(command.value, ["timeoutMs", "retryCount", "auth", "secret", "apiKey"]) ||
        !command.value.providerName.trim() ||
        !command.value.modelName.trim() ||
        (command.value.effort !== undefined && !command.value.effort.trim()) ||
        (command.value.fallbackModelName !== undefined && !command.value.fallbackModelName.trim()))
        return false;
    return true;
}
function memoryValid(command) {
    return (!deniedFields(command.value, [
        "owner",
        "readScopes",
        "writeScope",
        "lastCompactedAt",
        "capsuleCount",
    ]) &&
        ["session", "short_term", "long_term"].includes(command.value.retentionPolicy) &&
        ["session_compaction", "rolling_summary"].includes(command.value.capsuleMode) &&
        Number.isInteger(command.value.rawWindowSize) &&
        command.value.rawWindowSize > 0 &&
        Number.isInteger(command.value.compactThreshold) &&
        command.value.compactThreshold > command.value.rawWindowSize &&
        typeof command.value.writebackReviewRequired === "boolean");
}
function permissionValid(command) {
    return (!deniedFields(command.value, ["profileId", "allowedPaths", "secretScopeId", "allowlist"]) &&
        Object.hasOwn(RISK_ORDER, command.value.riskCeiling) &&
        Object.hasOwn(RISK_ORDER, command.value.approvalRequiredFrom) &&
        typeof command.value.allowExternalNetwork === "boolean" &&
        typeof command.value.allowFilesystemWrite === "boolean" &&
        typeof command.value.allowShellExecution === "boolean" &&
        typeof command.value.allowScreenControl === "boolean");
}
function permissionElevation(current, next) {
    return (RISK_ORDER[next.riskCeiling] > RISK_ORDER[current.riskCeiling] ||
        RISK_ORDER[next.approvalRequiredFrom] > RISK_ORDER[current.approvalRequiredFrom] ||
        (!current.allowExternalNetwork && next.allowExternalNetwork) ||
        (!current.allowFilesystemWrite && next.allowFilesystemWrite) ||
        (!current.allowShellExecution && next.allowShellExecution) ||
        (!current.allowScreenControl && next.allowScreenControl));
}
function nextState(command, current) {
    const nextRevision = command.envelope.targetRevision;
    if (command.kind === "update_model") {
        if (!modelValid(command))
            return null;
        return {
            ...current,
            revision: nextRevision,
            modelProfile: {
                providerId: command.value.providerName.trim(),
                modelId: command.value.modelName.trim(),
                ...(command.value.effort?.trim() ? { effort: command.value.effort.trim() } : {}),
                ...(command.value.fallbackModelName?.trim()
                    ? { fallbackModelId: command.value.fallbackModelName.trim() }
                    : {}),
            },
        };
    }
    if (command.kind === "clear_model") {
        const { modelProfile: _modelProfile, ...withoutModelProfile } = current;
        return { ...withoutModelProfile, revision: nextRevision };
    }
    if (command.kind === "update_memory") {
        if (!memoryValid(command))
            return null;
        return {
            ...current,
            revision: nextRevision,
            memoryPolicy: {
                ...current.memoryPolicy,
                retentionPolicy: command.value.retentionPolicy,
                capsuleMode: command.value.capsuleMode,
                rawWindowSize: command.value.rawWindowSize,
                compactThreshold: command.value.compactThreshold,
                writebackReviewRequired: command.value.writebackReviewRequired,
            },
        };
    }
    if (!permissionValid(command))
        return null;
    return {
        ...current,
        revision: nextRevision,
        permissionProfile: {
            ...current.permissionProfile,
            ...command.value,
        },
    };
}
function sameSettings(left, right) {
    return (toCanonicalJson(left.modelProfile ?? null) === toCanonicalJson(right.modelProfile ?? null) &&
        toCanonicalJson(left.memoryPolicy) === toCanonicalJson(right.memoryPolicy) &&
        toCanonicalJson(left.permissionProfile) === toCanonicalJson(right.permissionProfile));
}
export async function executeAgentOperationalSettingsCommand(command, ports) {
    const requestFingerprint = fingerprint(command);
    const prior = ports.receiptByNonce(command.envelope.nonce);
    if (prior) {
        if (prior.mutationId === command.envelope.mutationId &&
            prior.requestFingerprint === requestFingerprint)
            return prior.receipt;
        return rejected({
            command,
            revision: 0,
            reasonCode: "mutation_nonce_conflict",
            state: "conflict",
        });
    }
    if (!AGENT_REF_PATTERN.test(command.agentRef))
        return rejected({ command, revision: 0, reasonCode: "agent_ref_invalid" });
    const current = ports.current(command.agentRef);
    if (!current)
        return rejected({ command, revision: 0, reasonCode: "agent_ref_not_found" });
    if (!current.active || current.root)
        return rejected({ command, revision: current.revision, reasonCode: "agent_settings_inactive" });
    const next = nextState(command, current);
    if (!next)
        return rejected({
            command,
            revision: current.revision,
            reasonCode: `agent_${command.kind}_invalid`,
        });
    if (sameSettings(current, next))
        return rejected({ command, revision: current.revision, reasonCode: "agent_settings_unchanged" });
    const elevated = command.kind === "update_permission" &&
        permissionElevation(current.permissionProfile, command.value);
    const requiredScope = elevated
        ? "agent_permission:elevate"
        : command.envelope.scope === "agent_permission:elevate"
            ? "agent_permission:elevate"
            : "agent_settings:write";
    if (command.envelope.purpose !== `agent_settings_${command.kind}`)
        return rejected({ command, revision: current.revision, reasonCode: "mutation_purpose_denied" });
    const checked = validateMutationEnvelope({
        envelope: command.envelope,
        requiredScope,
        currentRevision: current.revision,
        now: ports.now(),
        maxAgeMs: 5 * 60_000,
        usedNonces: new Set(),
    });
    if (!checked.ok)
        return rejected({
            command,
            revision: current.revision,
            reasonCode: checked.diagnostics[0]?.reasonCode ?? "mutation_rejected",
            ...(checked.diagnostics.some((item) => item.reasonCode === "mutation_revision_conflict")
                ? { state: "conflict" }
                : {}),
        });
    if (!ports.reserveReceipt({
        envelope: command.envelope,
        kind: command.kind,
        requestFingerprint,
        state: "validating",
        now: ports.now(),
    }))
        return rejected({ command, revision: current.revision, reasonCode: "mutation_nonce_replayed" });
    const initial = {
        mutationId: command.envelope.mutationId,
        state: "draft",
        baseRevision: current.revision,
        targetRevision: command.envelope.targetRevision,
        reasonCode: null,
    };
    const terminal = await executeCapabilityMutation(initial, {
        validate: async () => ({ ok: true }),
        persist: async (expectedRevision) => ports.persist({
            current,
            next,
            expectedRevision,
            targetRevision: command.envelope.targetRevision,
        }),
        apply: async () => ({ ok: true }),
        verify: async (targetRevision) => ports.verify({
            internalAgentId: current.internalAgentId,
            expected: next,
            targetRevision,
        }),
        rollback: async () => ports.rollback({ previous: current, failedRevision: command.envelope.targetRevision }),
    });
    const projected = projectCapabilityMutationReceipt(terminal);
    const receipt = {
        mutationId: projected.mutationId,
        kind: command.kind,
        state: projected.state,
        reasonCode: projected.reasonCode,
        revision: terminal.state === "active" ? terminal.targetRevision : terminal.baseRevision,
        agentRef: command.agentRef,
        allowedActions: projected.allowedActions,
    };
    ports.finishReceipt({
        mutationId: receipt.mutationId,
        state: terminal.state,
        reasonCode: terminal.reasonCode,
        receipt,
        now: ports.now(),
    });
    return receipt;
}
//# sourceMappingURL=agent-operational-settings-command.js.map