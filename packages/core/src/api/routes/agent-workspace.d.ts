import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AgentCapabilityBindingCommandInput, AgentCapabilityBindingReceipt } from "../../agents/agent-capability-binding-command.js";
import { type AgentCapabilityBindingProjection } from "../../agents/agent-capability-binding-projection.js";
import { type AgentIdentityCommand, type AgentIdentityMutationReceipt } from "../../agents/agent-identity-command.js";
import { type AgentOperationalSettingsCommand, type AgentOperationalSettingsMutationReceipt } from "../../agents/agent-operational-settings-command.js";
import type { AgentOperationalSettingsProjection } from "../../agents/agent-operational-settings-projection.js";
import type { AgentRelationshipCommandInput, AgentRelationshipMutationReceipt } from "../../agents/agent-relationship-command.js";
import { type AgentRelationshipProjection } from "../../agents/agent-relationship-projection.js";
import type { AgentWorkspaceProjection } from "../../agents/agent-workspace-projection.js";
export interface AgentWorkspaceRouteOptions {
    projection(request: FastifyRequest): AgentWorkspaceProjection;
    capabilityProjection?(request: FastifyRequest, agentRef: string): AgentCapabilityBindingProjection | null;
    executeCapabilityBindingCommand?(request: FastifyRequest, command: AgentCapabilityBindingCommandInput): Promise<AgentCapabilityBindingReceipt>;
    relationshipProjection?(request: FastifyRequest): AgentRelationshipProjection;
    settingsProjection?(request: FastifyRequest, agentRef: string): AgentOperationalSettingsProjection | null;
    executeOperationalSettingsCommand?(request: FastifyRequest, command: AgentOperationalSettingsCommand): Promise<AgentOperationalSettingsMutationReceipt>;
    executeRelationshipCommand?(request: FastifyRequest, command: AgentRelationshipCommandInput): Promise<AgentRelationshipMutationReceipt>;
    executeIdentityCommand?(request: FastifyRequest, command: AgentIdentityCommand): AgentIdentityMutationReceipt;
    now?: () => number;
    createMutationId?: () => string;
    logger?: {
        product(fields: Readonly<Record<string, unknown>>): void;
        fieldDebug(fields: Readonly<Record<string, unknown>>): void;
        development(fields: Readonly<Record<string, unknown>>): void;
    };
}
export declare function registerAgentWorkspaceRoute(app: FastifyInstance, options: AgentWorkspaceRouteOptions): void;
//# sourceMappingURL=agent-workspace.d.ts.map