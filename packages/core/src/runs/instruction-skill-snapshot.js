const CHECKSUM_PATTERN = /^sha256:[a-f0-9]{64}$/u;
function frozenResult(snapshots, findings) {
    return Object.freeze({
        snapshots: Object.freeze(snapshots.map((snapshot) => Object.freeze({ ...snapshot }))),
        findings: Object.freeze(findings.map((finding) => Object.freeze({ ...finding }))),
    });
}
export function loadInstructionSkillSnapshots(input, ports) {
    const snapshots = [];
    const findings = [];
    let totalBytes = 0;
    const observed = new Set();
    const skills = [...input.skills].sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
    for (const skill of skills) {
        if (skill.status !== "enabled")
            continue;
        const capabilityId = skill.capabilityId.trim();
        const targetId = skill.targetId.trim();
        if (!capabilityId || !targetId || observed.has(capabilityId)) {
            findings.push({
                capabilityId,
                reasonCode: "instruction_snapshot_identity_invalid",
            });
            continue;
        }
        observed.add(capabilityId);
        let source;
        try {
            source = ports.readSource({
                sourceRef: skill.sourceRef,
                maxBytes: input.maxSourceBytes,
            });
        }
        catch {
            source = { ok: false, reasonCode: "instruction_source_unavailable" };
        }
        if (!source.ok) {
            findings.push({ capabilityId, reasonCode: source.reasonCode });
            continue;
        }
        if (!Number.isInteger(source.byteLength) ||
            source.byteLength < 1 ||
            source.byteLength > input.maxSourceBytes ||
            !source.content.trim() ||
            !CHECKSUM_PATTERN.test(source.checksum)) {
            findings.push({
                capabilityId,
                reasonCode: "instruction_source_evidence_invalid",
            });
            continue;
        }
        if (totalBytes + source.byteLength > input.maxTotalBytes) {
            findings.push({
                capabilityId,
                reasonCode: "instruction_snapshot_total_limit_exceeded",
            });
            continue;
        }
        totalBytes += source.byteLength;
        snapshots.push({
            capabilityId,
            targetId,
            risk: skill.risk,
            content: `${source.content}`,
            checksum: source.checksum,
        });
    }
    return frozenResult(snapshots, findings);
}
//# sourceMappingURL=instruction-skill-snapshot.js.map