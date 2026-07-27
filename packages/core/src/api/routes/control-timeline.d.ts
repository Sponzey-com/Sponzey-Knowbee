import type { FastifyInstance } from "fastify";
import { type ControlExportAudience } from "../../control-plane/timeline.js";
import { type AuditAccessRuntimeDependencies } from "../audit-access-runtime.js";
export type ControlTimelineExposureContext = "public" | "audit";
export declare function resolveControlTimelineAudience(requestedAudience: string | undefined, exposureContext: ControlTimelineExposureContext): ControlExportAudience;
export declare function registerControlTimelineRoute(app: FastifyInstance, auditDependencies?: AuditAccessRuntimeDependencies): void;
//# sourceMappingURL=control-timeline.d.ts.map