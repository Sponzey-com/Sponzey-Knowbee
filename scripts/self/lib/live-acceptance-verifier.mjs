import { createHash, createPublicKey, verify as verifyDetachedSignature } from "node:crypto"
import { lstatSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

export function loadTrustedLiveAcceptanceVerifier(path) {
  const publicKeyPath = resolve(path)
  let publicKeyBytes
  try {
    const stat = lstatSync(publicKeyPath)
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size === 0 || stat.size > 64 * 1024) {
      throw new Error("live_acceptance_public_key_path_unsafe")
    }
    publicKeyBytes = readFileSync(publicKeyPath)
    if (/-----BEGIN [^-]*PRIVATE KEY-----/u.test(publicKeyBytes.toString("ascii"))) {
      throw new Error("live_acceptance_private_key_forbidden")
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "live_acceptance_public_key_path_unsafe" ||
        error.message === "live_acceptance_private_key_forbidden")
    ) {
      throw error
    }
    throw new Error("live_acceptance_public_key_load_failed")
  }

  let publicKey
  try {
    publicKey = createPublicKey(publicKeyBytes)
    if (publicKey.asymmetricKeyType !== "ed25519") {
      throw new Error("live_acceptance_public_key_unsupported")
    }
  } catch (error) {
    if (error instanceof Error && error.message === "live_acceptance_public_key_unsupported") {
      throw error
    }
    throw new Error("live_acceptance_public_key_invalid")
  }
  const keyId = `sha256:${createHash("sha256")
    .update(publicKey.export({ type: "spki", format: "der" }))
    .digest("hex")}`
  const verifySignature = ({ algorithm, keyId: claimedKeyId, signatureBase64, payloadBytes }) => {
    if (algorithm !== "ed25519" || claimedKeyId !== keyId) return false
    const signatureBytes = Buffer.from(signatureBase64, "base64")
    if (signatureBytes.byteLength !== 64 || signatureBytes.toString("base64") !== signatureBase64) {
      return false
    }
    return verifyDetachedSignature(null, Buffer.from(payloadBytes), publicKey, signatureBytes)
  }
  return Object.freeze({ keyId, verifySignature })
}
