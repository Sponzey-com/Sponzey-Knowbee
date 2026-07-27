import { lookup } from "node:dns/promises"
import {
  evaluatePublicNetworkTarget,
  type PublicTargetRejectionCode,
} from "../security/network-target-policy.js"

export type NetworkAddressResolver = (hostname: string) => Promise<readonly string[]>
export type HttpFetcher = (input: string | URL, init?: RequestInit) => Promise<Response>

export class NetworkTargetPolicyError extends Error {
  constructor(
    readonly code:
      | PublicTargetRejectionCode
      | "dns_resolution_failed"
      | "redirect_cycle"
      | "redirect_limit_exceeded",
  ) {
    super(`Network target rejected: ${code}`)
    this.name = "NetworkTargetPolicyError"
  }
}

export async function defaultNetworkAddressResolver(
  hostname: string,
): Promise<readonly string[]> {
  try {
    return (await lookup(hostname, { all: true, verbatim: true }))
      .map((result) => result.address)
  } catch {
    throw new NetworkTargetPolicyError("dns_resolution_failed")
  }
}

async function validateResolvedTarget(
  rawUrl: string,
  resolver: NetworkAddressResolver,
): Promise<string> {
  let hostname: string
  try {
    hostname = new URL(rawUrl).hostname.replace(/^\[|\]$/gu, "").toLowerCase()
  } catch {
    throw new NetworkTargetPolicyError("invalid_url")
  }
  const decision = evaluatePublicNetworkTarget({
    rawUrl,
    resolvedAddresses: await resolver(hostname),
  })
  if (!decision.allowed) throw new NetworkTargetPolicyError(decision.code)
  return decision.canonicalUrl
}

export async function fetchPublicHttp(input: {
  rawUrl: string
  resolver: NetworkAddressResolver
  fetcher: HttpFetcher
  maxRedirects: number
  signal?: AbortSignal
}): Promise<{ response: Response; effectiveUrl: string }> {
  let currentUrl = input.rawUrl
  let redirectCount = 0
  const visited = new Set<string>()
  while (true) {
    const canonicalUrl = await validateResolvedTarget(currentUrl, input.resolver)
    if (input.signal?.aborted) throw new Error("web_document_cancelled")
    if (visited.has(canonicalUrl)) throw new NetworkTargetPolicyError("redirect_cycle")
    visited.add(canonicalUrl)
    const response = await input.fetcher(canonicalUrl, {
      headers: {
        Accept: "text/html,text/plain,application/xhtml+xml",
        "User-Agent": "Sponzey Knowbee/0.1.0",
      },
      redirect: "manual",
      ...(input.signal ? { signal: input.signal } : {}),
    })
    const location = response.headers.get("location")
    if (response.status < 300 || response.status >= 400 || !location) {
      return { response, effectiveUrl: canonicalUrl }
    }
    if (redirectCount >= input.maxRedirects) {
      throw new NetworkTargetPolicyError("redirect_limit_exceeded")
    }
    redirectCount += 1
    currentUrl = new URL(location, canonicalUrl).toString()
  }
}

export async function applyPublicTargetRouteGuard(input: {
  rawUrl: string
  resolver: NetworkAddressResolver
  continueRequest: () => Promise<unknown>
  abortRequest: () => Promise<unknown>
}): Promise<void> {
  try {
    await validateResolvedTarget(input.rawUrl, input.resolver)
    await input.continueRequest()
  } catch {
    await input.abortRequest()
  }
}
