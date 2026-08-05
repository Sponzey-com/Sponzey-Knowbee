import type { FastifyInstance } from "fastify";
import type { MutationEnvelope } from "../../capabilities/capability-security-boundary.js";
import { type YeonjangBindingReceipt } from "../../capabilities/yeonjang-binding-command.js";
import { type YeonjangRecoveryAction, type YeonjangRecoveryReceipt } from "../../capabilities/yeonjang-recovery-command.js";
import type { MqttConfig } from "../../config/types.js";
import type { YeonjangBrowserActiveTabInfoObservation } from "../../capabilities/yeonjang-browser-active-tab-info-contract.js";
import { type YeonjangBrowserActiveTabInfoRegistryRecord } from "../../release/yeonjang-browser-active-tab-info-readiness-source-adapter.js";
import { type YeonjangFleetProjection } from "../../yeonjang/topology.js";
export declare function registerYeonjangInstancesRoute(app: FastifyInstance, options?: {
    fleetProjection?: () => YeonjangFleetProjection;
    now?: () => number;
    mqttConfig?: MqttConfig;
    currentRevision?: () => number;
    publicRefForAgentId?: (agentId: string) => string;
    bindingProjectionRepository?: {
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
    };
    browserActiveTabInfoReadinessRecords?: () => readonly YeonjangBrowserActiveTabInfoRegistryRecord[];
    browserActiveTabInfoRedactedObservationForTarget?: (publicTargetName: string) => YeonjangBrowserActiveTabInfoObservation | undefined;
    mutationActorForRequest?: (request: unknown) => string | null;
    recoveryExecutor?: (input: {
        envelope: MutationEnvelope;
        yeonjangRef: string;
        action: YeonjangRecoveryAction;
        signal: AbortSignal;
    }) => Promise<YeonjangRecoveryReceipt>;
    bindingExecutor?: (input: {
        envelope: MutationEnvelope;
        yeonjangRef: string;
        agentRef: string;
        action: "bind" | "unbind";
    }) => Promise<YeonjangBindingReceipt>;
    pairingExecutionAdmissionKeyProvisioner?: {
        provision(input: {
            readonly extensionId: string;
        }): {
            readonly ok: true;
        } | {
            readonly ok: false;
            readonly reasonCode: string;
        };
        remove(input: {
            readonly extensionId: string;
        }): {
            readonly ok: true;
        } | {
            readonly ok: false;
        };
    };
}): void;
//# sourceMappingURL=yeonjang-instances.d.ts.map