import type { AgentTool } from "../types.js";
import { type YeonjangTargetedToolParams } from "./yeonjang-target.js";
interface ShellExecParams extends YeonjangTargetedToolParams {
    command: string;
    workDir?: string;
    timeoutSec?: number;
    env?: Record<string, string>;
}
export declare const shellExecTool: AgentTool<ShellExecParams>;
export {};
//# sourceMappingURL=shell.d.ts.map