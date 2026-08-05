import type { AgentExecutionDecision } from "./execution-decision-contract.js";
import type { StructuredTaskScope } from "../contracts/sub-agent-orchestration.js";
export interface AuthoredWorkflowDependency {
    fromScopeIndex: number;
    toScopeIndex: number;
    reasonCode: "workflow_unit_dependency";
}
export interface AuthoredWorkflowDraft {
    state: "ready";
    taskScopes: StructuredTaskScope[];
    dependencies: AuthoredWorkflowDependency[];
    reasonCodes: string[];
}
export interface RejectedWorkflowDraft {
    state: "rejected";
    taskScopes: [];
    dependencies: [];
    reasonCodes: string[];
}
export type WorkflowAuthoringResult = AuthoredWorkflowDraft | RejectedWorkflowDraft;
export declare function authorWorkflowFromExecutionDecision(decision: AgentExecutionDecision | undefined): WorkflowAuthoringResult | undefined;
//# sourceMappingURL=workflow-authoring.d.ts.map