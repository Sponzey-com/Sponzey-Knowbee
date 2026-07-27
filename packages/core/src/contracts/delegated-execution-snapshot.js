import { createHash } from "node:crypto";
import { validateWorkHandoffPackage, } from "./work-record.js";
function fingerprint(payload) {
    return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}
function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value))
            deepFreeze(child);
    }
    return value;
}
export function buildDelegatedExecutionSnapshot(input) {
    if (input.handoff.handoff_id !== `handoff:${input.command.commandRequestId}` ||
        input.handoff.work_id !== `work:${input.command.subSessionId}`) {
        return { ok: false, reasonCode: "handoff_command_mismatch" };
    }
    if (input.command.targetAgentId !== input.agent.agentId ||
        input.handoff.target_agent_name !== input.agent.agentName ||
        input.command.targetAgentNameSnapshot !== input.agent.agentName) {
        return { ok: false, reasonCode: "handoff_target_mismatch" };
    }
    const handoffValidation = validateWorkHandoffPackage(input.handoff);
    if (!handoffValidation.ok)
        return { ok: false, reasonCode: "handoff_invalid" };
    if (input.promptBundle.agentId !== input.agent.agentId ||
        input.promptBundle.agentNameSnapshot !== input.agent.agentName) {
        return { ok: false, reasonCode: "prompt_bundle_agent_mismatch" };
    }
    const payload = structuredClone({
        schemaVersion: "delegated-execution-snapshot-v1",
        commandRequestId: input.command.commandRequestId,
        subSessionId: input.command.subSessionId,
        handoff: input.handoff,
        agent: input.agent,
        prompt: {
            bundleId: input.promptBundle.bundleId,
            ...(input.promptBundle.promptChecksum
                ? { checksum: input.promptBundle.promptChecksum }
                : {}),
        },
        ...(input.promptBundle.modelProfileSnapshot
            ? { modelProfile: input.promptBundle.modelProfileSnapshot }
            : {}),
        capabilityPolicy: input.promptBundle.capabilityPolicy,
    });
    return {
        ok: true,
        snapshot: deepFreeze({ ...payload, fingerprint: fingerprint(payload) }),
    };
}
export function validateDelegatedExecutionSnapshot(snapshot, expected) {
    const { fingerprint: expectedFingerprint, ...payload } = snapshot;
    if (fingerprint(payload) !== expectedFingerprint) {
        return {
            valid: false,
            reasonCode: "delegated_execution_snapshot_fingerprint_mismatch",
        };
    }
    if (expected &&
        (snapshot.commandRequestId !== expected.commandRequestId ||
            snapshot.subSessionId !== expected.subSessionId ||
            snapshot.agent.agentId !== expected.agentId ||
            snapshot.prompt.bundleId !== expected.promptBundleId)) {
        return { valid: false, reasonCode: "delegated_execution_snapshot_runtime_mismatch" };
    }
    return { valid: true, reasonCode: "delegated_execution_snapshot_valid" };
}
//# sourceMappingURL=delegated-execution-snapshot.js.map