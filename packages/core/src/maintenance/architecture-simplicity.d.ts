export interface CanonicalModuleOwner {
    moduleId: string;
    responsibilityIds: string[];
}
export type NewBoundaryReason = {
    kind: "dependency_inversion";
    detail: string;
} | {
    kind: "ownership_violation";
    detail: string;
};
export type NewModuleDecision = {
    status: "extend_existing";
    ownerModuleId: string;
} | {
    status: "new_boundary_eligible";
    proposedModuleId: string;
    reason: NewBoundaryReason["kind"];
};
export declare function evaluateNewModuleProposal(input: {
    responsibilityId: string;
    searchComplete: boolean;
    candidateOwners: CanonicalModuleOwner[];
    proposedModuleId: string;
    boundaryReason: NewBoundaryReason | null;
    evidenceRefs: string[];
}): NewModuleDecision;
export type WrapperOwnedBehavior = "policy" | "transformation" | "validation" | "stable_interface";
export interface ArchitectureSimplicityViolation {
    code: "pass_through_wrapper" | "duplicate_adapter" | "hidden_mutable_global";
    ownerId: string;
}
export declare function evaluateArchitectureSimplicity(input: {
    wrappers: Array<{
        moduleId: string;
        ownedBehaviors: WrapperOwnedBehavior[];
    }>;
    adapters: Array<{
        moduleId: string;
        externalBoundaryId: string;
        portId: string;
    }>;
    globals: Array<{
        symbolId: string;
        mutable: boolean;
        purpose: "runtime_config" | "registry" | "cache" | "other";
    }>;
}): {
    ok: boolean;
    violations: ArchitectureSimplicityViolation[];
};
//# sourceMappingURL=architecture-simplicity.d.ts.map