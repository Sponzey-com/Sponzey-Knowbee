import type { FastifyInstance } from "fastify";
import { type CapabilityProjectionOptions } from "../../control-plane/index.js";
import type { KnowbeeConfig } from "../../config/index.js";
import { type SkillBindingRow, type SkillCatalogRow } from "../../capabilities/skill-catalog-query.js";
import { type SkillSourceInspection } from "../../capabilities/skill-source-validation.js";
import { type SkillCreateDraft, type SkillCreateUserReceipt } from "../../capabilities/skill-create-command.js";
import { type SkillUpdateChange, type SkillUpdateUserReceipt } from "../../capabilities/skill-update-command.js";
import { type SkillBindingUserReceipt } from "../../capabilities/skill-binding-command.js";
import { type SkillDeleteUserReceipt } from "../../capabilities/skill-delete-command.js";
import type { MutationEnvelope } from "../../capabilities/capability-security-boundary.js";
export interface SkillCatalogReadRepository {
    listSkills(): readonly SkillCatalogRow[];
    listBindings(): readonly SkillBindingRow[];
}
export interface SkillBindingProjectionRepository {
    listAgents(): readonly {
        agent_id: string;
        agent_name: string;
        status: string;
    }[];
    listBindings(): readonly {
        agent_id: string;
        catalog_id: string;
        status: string;
    }[];
}
export interface CapabilitiesRouteOptions extends Omit<CapabilityProjectionOptions, "config"> {
    skillCatalogRepository?: SkillCatalogReadRepository;
    skillBindingProjectionRepository?: SkillBindingProjectionRepository;
    skillPublicRefForId?: (skillId: string) => string;
    agentPublicRefForId?: (agentId: string) => string;
    skillSourceInspector?: (input: {
        requestedPath: string;
        allowedRoots: readonly string[];
    }) => SkillSourceInspection;
    runtimeConfigForRequest?: (request: unknown) => Pick<KnowbeeConfig, "profile" | "security">;
    skillCreateExecutor?: (input: {
        envelope: MutationEnvelope;
        draft: SkillCreateDraft;
        allowedRoots: readonly string[];
    }) => Promise<SkillCreateUserReceipt>;
    skillUpdateExecutor?: (input: {
        envelope: MutationEnvelope;
        skillRef: string;
        change: SkillUpdateChange;
    }) => Promise<SkillUpdateUserReceipt>;
    skillBindingExecutor?: (input: {
        envelope: MutationEnvelope;
        skillRef: string;
        agentRef: string;
        action: "bind" | "unbind";
    }) => Promise<SkillBindingUserReceipt>;
    skillDeleteExecutor?: (input: {
        envelope: MutationEnvelope;
        skillRef: string;
    }) => Promise<SkillDeleteUserReceipt>;
    mutationActorForRequest?: (request: unknown) => string | null;
    now?: () => number;
}
export declare function registerCapabilitiesRoute(app: FastifyInstance, options?: CapabilitiesRouteOptions): void;
//# sourceMappingURL=capabilities.d.ts.map