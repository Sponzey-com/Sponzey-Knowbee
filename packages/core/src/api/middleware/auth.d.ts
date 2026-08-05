import type { FastifyReply, FastifyRequest } from "fastify";
export interface ApiAuthenticationPrincipalReceipt {
    readonly principalRef: "api:static-token-owner";
    readonly role: "administrator";
    readonly authenticationMethod: "static_bearer_token";
}
export declare function getApiAuthenticationPrincipal(request: FastifyRequest): ApiAuthenticationPrincipalReceipt | null;
export declare function authMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void>;
//# sourceMappingURL=auth.d.ts.map