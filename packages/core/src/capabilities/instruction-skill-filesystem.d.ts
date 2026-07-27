export type InstructionSkillSourceReadResult = {
    ok: true;
    content: string;
    checksum: `sha256:${string}`;
    byteLength: number;
} | {
    ok: false;
    reasonCode: "instruction_source_unavailable" | "instruction_source_identity_changed" | "instruction_manifest_missing" | "instruction_source_too_large" | "instruction_source_not_utf8" | "instruction_source_empty";
};
export declare function readInstructionSkillSource(input: {
    sourceRef: string;
    maxBytes: number;
}): InstructionSkillSourceReadResult;
//# sourceMappingURL=instruction-skill-filesystem.d.ts.map