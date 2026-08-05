import { type PublicWebDocumentDependencies } from "../../adapters/public-web-document.js";
import type { SourceFreshnessPolicy } from "../../contracts/web-retrieval.js";
import type { AgentTool } from "../types.js";
export { applyPublicTargetRouteGuard, fetchPublicHttp, NetworkTargetPolicyError, } from "../../adapters/public-http-fetch.js";
export type { HttpFetcher, NetworkAddressResolver, } from "../../adapters/public-http-fetch.js";
interface WebFetchParams {
    url: string;
    maxLength?: number;
    freshnessPolicy?: SourceFreshnessPolicy;
}
export type WebFetchDependencies = PublicWebDocumentDependencies;
export declare function createWebFetchTool(dependencies?: WebFetchDependencies): AgentTool<WebFetchParams>;
export declare const webFetchTool: AgentTool<WebFetchParams>;
//# sourceMappingURL=web-fetch.d.ts.map