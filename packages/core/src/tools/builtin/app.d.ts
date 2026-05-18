import type { AgentTool } from "../types.js";
import { type YeonjangTargetedToolParams } from "./yeonjang-target.js";
interface AppLaunchParams extends YeonjangTargetedToolParams {
    app: string;
    args?: string[];
    background?: boolean;
}
interface AppListParams {
    filter?: string;
}
export declare const appLaunchTool: AgentTool<AppLaunchParams>;
export declare const appListTool: AgentTool<AppListParams>;
export {};
//# sourceMappingURL=app.d.ts.map