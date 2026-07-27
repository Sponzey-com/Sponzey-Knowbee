import { createHash } from "node:crypto";
export function buildSuccessfulToolEvidenceFromYeonjangGoalValidation(input) {
    const output = input.output.trim() || input.evidence.summary;
    return {
        toolName: input.evidence.toolName,
        output,
        details: {
            via: "yeonjang",
            evidence: input.evidence,
        },
        evidenceSource: {
            sourceKind: "yeonjang",
            sourceRef: `tool-result:yeonjang:${fingerprint(input.evidence)}`,
            trustClass: "untrusted_external",
            instructionIsolation: "data_only",
        },
    };
}
function fingerprint(value) {
    return createHash("sha256").update(stable(value)).digest("hex");
}
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
//# sourceMappingURL=completion-evidence-adapter.js.map