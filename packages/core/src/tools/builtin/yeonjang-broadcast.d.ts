import { type YeonjangBroadcastIntent, type YeonjangBroadcastRetryReceipt, type YeonjangBroadcastToolName } from "../../contracts/yeonjang-broadcast.js";
import type { AgentTool } from "../types.js";
import { type YeonjangTargetSelector } from "../../contracts/yeonjang-target.js";
interface YeonjangBroadcastRunParams {
    toolName: YeonjangBroadcastToolName;
    toolParams?: Record<string, unknown>;
    targetSelector: YeonjangTargetSelector;
    broadcastIntent: YeonjangBroadcastIntent;
    retryReceipt?: YeonjangBroadcastRetryReceipt;
}
export declare const yeonjangBroadcastRunTool: AgentTool<YeonjangBroadcastRunParams>;
export {};
//# sourceMappingURL=yeonjang-broadcast.d.ts.map