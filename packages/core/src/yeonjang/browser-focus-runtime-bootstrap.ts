import { randomUUID } from "node:crypto"

import { createYeonjangBrowserFocusExecutionAdmissionIssuer } from "../capabilities/yeonjang-browser-focus-execution-admission-issuer.js"
import type { YeonjangBrowserFocusExecutionAdmissionIssuerPort } from "../tools/types.js"
import {
  createYeonjangExecutionAdmissionKeyRegistry,
  createYeonjangExecutionAdmissionPasswordHandle,
} from "./execution-admission-key-port.js"
import type { YeonjangExecutionAdmissionKeyProvisionerPort } from "./pairing-execution-admission-provisioning.js"
import {
  createYeonjangExecutionAuthorizationIssuer,
  type YeonjangExecutionAuthorizationIssuerPort,
} from "./execution-authorization-receipt.js"

const DEFAULT_KEY_ID = "mqtt-connection-password-v1"
const DEFAULT_TTL_MS = 60_000

export interface BrowserFocusRuntimeBootstrapOptions {
  readonly trustedExtensionIds: readonly string[]
  readonly connectionPassword: string
  readonly keyId?: string
  readonly now?: () => Date
  readonly createNonce?: () => string
}

export interface BrowserFocusRuntimeBootstrap {
  readonly issuer?: YeonjangBrowserFocusExecutionAdmissionIssuerPort
  readonly executionAuthorizationIssuer?: YeonjangExecutionAuthorizationIssuerPort
  readonly pairingExecutionAdmissionKeyProvisioner?: YeonjangExecutionAdmissionKeyProvisionerPort
}

/**
 * Produces immutable runtime dependencies at process startup. The only later
 * mutation is an approved pairing transaction that adds/removes its signer.
 */
export function createBrowserFocusRuntimeBootstrap(
  input: BrowserFocusRuntimeBootstrapOptions,
): BrowserFocusRuntimeBootstrap {
  const connectionPassword = input.connectionPassword.trim()
  const keyId = input.keyId?.trim() || DEFAULT_KEY_ID
  if (!connectionPassword || !keyId) return Object.freeze({})

  const registry = createYeonjangExecutionAdmissionKeyRegistry()
  const register = (extensionId: string) => {
    const handle = createYeonjangExecutionAdmissionPasswordHandle({
      extensionId,
      keyId,
      connectionPassword,
    })
    return handle
      ? registry.register(handle)
      : { ok: false as const, reasonCode: "execution_admission_key_bootstrap_invalid" as const }
  }
  for (const extensionId of uniqueExtensionIds(input.trustedExtensionIds)) {
    if (!register(extensionId).ok) return Object.freeze({})
  }
  const provisioner: YeonjangExecutionAdmissionKeyProvisionerPort = Object.freeze({
    provision: ({ extensionId }: { readonly extensionId: string }) => {
      const registered = register(extensionId)
      return registered.ok
        ? { ok: true as const }
        : { ok: false as const, reasonCode: "execution_admission_key_provision_failed" }
    },
    remove: ({ extensionId }: { readonly extensionId: string }) => {
      registry.remove({ extensionId })
      return { ok: true as const }
    },
  })
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
  })
}

function uniqueExtensionIds(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right),
    ),
  )
}
