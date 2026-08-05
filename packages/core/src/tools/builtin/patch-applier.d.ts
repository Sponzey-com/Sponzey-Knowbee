import type { SecurityConfig } from "../../config/types.js";
import type { ParsedPatch } from "./patch-parser.js";
export interface ApplyResult {
    success: boolean;
    message: string;
    filesChanged: string[];
}
export declare function applyPatch(patch: ParsedPatch, workDir: string, securityConfig?: Pick<SecurityConfig, "allowedPaths">): ApplyResult;
//# sourceMappingURL=patch-applier.d.ts.map