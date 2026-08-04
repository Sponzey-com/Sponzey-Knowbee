import { randomUUID } from "node:crypto";
import { createYeonjangBrowserFocusExecutionAdmissionIssuer } from "../capabilities/yeonjang-browser-focus-execution-admission-issuer.js";
import { createYeonjangExecutionAdmissionKeyRegistry, createYeonjangExecutionAdmissionPasswordHandle, } from "./execution-admission-key-port.js";
import { createYeonjangExecutionAuthorizationIssuer, } from "./execution-authorization-receipt.js";
const DEFAULT_KEY_ID = "mqtt-connection-password-v1";
const DEFAULT_TTL_MS = 60_000;
/**
 * Produces immutable runtime dependencies at process startup. The only later
 * mutation is an approved pairing transaction that adds/removes its signer.
 */
export function createBrowserFocusRuntimeBootstrap(input) {
    const connectionPassword = input.connectionPassword.trim();
    const keyId = input.keyId?.trim() || DEFAULT_KEY_ID;
    if (!connectionPassword || !keyId)
        return Object.freeze({});
    const registry = createYeonjangExecutionAdmissionKeyRegistry();
    const register = (extensionId) => {
        const handle = createYeonjangExecutionAdmissionPasswordHandle({
            extensionId,
            keyId,
            connectionPassword,
        });
        return handle
            ? registry.register(handle)
            : { ok: false, reasonCode: "execution_admission_key_bootstrap_invalid" };
    };
    for (const extensionId of uniqueExtensionIds(input.trustedExtensionIds)) {
        if (!register(extensionId).ok)
            return Object.freeze({});
    }
    const provisioner = Object.freeze({
        provision: ({ extensionId }) => {
            const registered = register(extensionId);
            return registered.ok
                ? { ok: true }
                : { ok: false, reasonCode: "execution_admission_key_provision_failed" };
        },
        remove: ({ extensionId }) => {
            registry.remove({ extensionId });
            return { ok: true };
        },
    });
    return Object.freeze({
        issuer: createYeonjangBrowserFocusExecutionAdmissionIssuer({
            keyPort: registry.keyPort,
            now: input.now ?? (() => new Date()),
            createNonce: input.createNonce ?? randomUUID,
            ttlMs: DEFAULT_TTL_MS,
        }),
        executionAuthorizationIssuer: createYeonjangExecutionAuthorizationIssuer({
            issuer: "knowbee-core",
            keyPort: registry.keyPort,
            createAuthorizationId: input.createNonce ?? randomUUID,
            now: () => (input.now ?? (() => new Date()))().getTime(),
        }),
        pairingExecutionAdmissionKeyProvisioner: provisioner,
    });
}
function uniqueExtensionIds(values) {
    return Object.freeze([...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}
//# sourceMappingURL=browser-focus-runtime-bootstrap.js.map