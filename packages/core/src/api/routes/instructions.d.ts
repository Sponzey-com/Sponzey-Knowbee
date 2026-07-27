import type { FastifyInstance } from "fastify";
import { type RawSystemPromptDisclosurePurpose, type SystemPromptDisclosureAuthorizationReceipt } from "../../contracts/system-prompt-disclosure-boundary.js";
export interface ActiveInstructionsDisclosureRouteOptions {
    resolveAuthorizationReceipt?: (authorizationId: string, context: {
        requestId: string;
        actorRef: string;
        audienceRef: string;
        purpose: RawSystemPromptDisclosurePurpose;
        targetSourceRef: string;
    }) => SystemPromptDisclosureAuthorizationReceipt | undefined;
    now?: () => number;
}
export declare function registerInstructionsRoute(app: FastifyInstance, options?: ActiveInstructionsDisclosureRouteOptions): void;
//# sourceMappingURL=instructions.d.ts.map