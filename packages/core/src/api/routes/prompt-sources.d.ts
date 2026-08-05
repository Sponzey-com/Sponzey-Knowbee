import type { FastifyInstance } from "fastify";
import { type RawSystemPromptDisclosurePurpose, type SystemPromptDisclosureAuthorizationReceipt } from "../../contracts/system-prompt-disclosure-boundary.js";
export interface PromptSourceDisclosureRouteOptions {
    resolveAuthorizationReceipt?: (authorizationId: string, context: {
        requestId: string;
        actorRef: string;
        audienceRef: string;
        purpose: RawSystemPromptDisclosurePurpose;
        targetSourceRef: string;
    }) => SystemPromptDisclosureAuthorizationReceipt | undefined;
    now?: () => number;
}
export declare function registerPromptSourcesRoute(app: FastifyInstance, options?: PromptSourceDisclosureRouteOptions): void;
//# sourceMappingURL=prompt-sources.d.ts.map