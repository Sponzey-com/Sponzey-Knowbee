import type { YeonjangClientOptions, YeonjangRequestMetadata } from "../../yeonjang/mqtt-client.js";
import type { ToolContext } from "../types.js";
export declare function buildYeonjangRequestMetadata(ctx: ToolContext): YeonjangRequestMetadata;
export declare function withYeonjangRequestMetadata(ctx: ToolContext, options?: YeonjangClientOptions, authorizationResourceScope?: string): YeonjangClientOptions;
//# sourceMappingURL=yeonjang-request-metadata.d.ts.map