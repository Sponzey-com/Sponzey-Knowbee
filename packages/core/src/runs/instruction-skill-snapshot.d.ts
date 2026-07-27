import type { InstructionSkillSourceReadResult } from "../capabilities/instruction-skill-filesystem.js";
import type { CapabilitySelectionInstructionSkill } from "./capability-selection-catalog.js";
export interface InstructionSkillRunSnapshot {
    readonly capabilityId: string;
    readonly targetId: string;
    readonly risk: "safe" | "approval_required" | "denied";
    readonly content: string;
    readonly checksum: `sha256:${string}`;
}
export interface InstructionSkillSnapshotFinding {
    readonly capabilityId: string;
    readonly reasonCode: Exclude<InstructionSkillSourceReadResult, {
        ok: true;
    }>["reasonCode"] | "instruction_source_evidence_invalid" | "instruction_snapshot_total_limit_exceeded" | "instruction_snapshot_identity_invalid";
}
export interface InstructionSkillSourceReader {
    readSource(input: {
        sourceRef: string;
        maxBytes: number;
    }): InstructionSkillSourceReadResult;
}
export declare function loadInstructionSkillSnapshots(input: {
    skills: readonly CapabilitySelectionInstructionSkill[];
    maxSourceBytes: number;
    maxTotalBytes: number;
}, ports: InstructionSkillSourceReader): {
    readonly snapshots: readonly InstructionSkillRunSnapshot[];
    readonly findings: readonly InstructionSkillSnapshotFinding[];
};
//# sourceMappingURL=instruction-skill-snapshot.d.ts.map