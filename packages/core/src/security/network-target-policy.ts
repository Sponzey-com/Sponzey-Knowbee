import { isIP } from "node:net"

export type PublicTargetRejectionCode =
  | "invalid_url"
  | "scheme_not_allowed"
  | "credentials_not_allowed"
  | "hostname_not_public"
  | "dns_result_empty"
  | "address_not_public"

export type PublicTargetDecision =
  | { allowed: true; canonicalUrl: string; hostname: string }
  | { allowed: false; code: PublicTargetRejectionCode }

export interface PublicNetworkTargetInput {
  rawUrl: string
  resolvedAddresses: readonly string[]
}

function ipv4Number(address: string): number | null {
  if (isIP(address) !== 4) return null
  const octets = address.split(".").map(Number)
  return (
    (((octets[0] ?? 0) << 24) |
      ((octets[1] ?? 0) << 16) |
      ((octets[2] ?? 0) << 8) |
      (octets[3] ?? 0)) >>>
    0
  )
}

function isInIpv4Range(value: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (value & mask) === (base & mask)
}

function isPublicIpv4(address: string): boolean {
  const value = ipv4Number(address)
  if (value === null) return false
  const blocked: ReadonlyArray<readonly [number, number]> = [
    [0x00000000, 8],
    [0x0a000000, 8],
    [0x64400000, 10],
    [0x7f000000, 8],
    [0xa9fe0000, 16],
    [0xac100000, 12],
    [0xc0000000, 24],
    [0xc0000200, 24],
    [0xc0586300, 24],
    [0xc0a80000, 16],
    [0xc6120000, 15],
    [0xc6336400, 24],
    [0xcb007100, 24],
    [0xe0000000, 4],
  ]
  return !blocked.some(([base, prefix]) => isInIpv4Range(value, base, prefix))
}

function expandIpv6(address: string): number[] | null {
  const zoneIndex = address.indexOf("%")
  const withoutZone = (zoneIndex >= 0 ? address.slice(0, zoneIndex) : address).toLowerCase()
  let normalized = withoutZone
  const ipv4Tail = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1]
  if (ipv4Tail) {
    const value = ipv4Number(ipv4Tail)
    if (value === null) return null
    normalized = `${normalized.slice(0, -ipv4Tail.length)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`
  }
  const halves = normalized.split("::")
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(":") : []
  const right = halves[1] ? halves[1].split(":") : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right]
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null
  return groups.map((group) => Number.parseInt(group, 16))
}

function isPublicIpv6(address: string): boolean {
  const groups = expandIpv6(address)
  if (!groups) return false
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups
  if (
    groups.every((group) => group === 0) ||
    (groups.slice(0, 7).every((group) => group === 0) && g7 === 1)
  )
    return false
  if ((g0 & 0xfe00) === 0xfc00 || (g0 & 0xffc0) === 0xfe80 || (g0 & 0xff00) === 0xff00) return false
  if (g0 === 0x0064 && g1 === 0xff9b && g2 === 0x0001) return false
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return false
  if (g0 === 0x2001 && g1 <= 0x01ff) return false
  if (g0 === 0x2001 && g1 === 0x0db8) return false
  if (g0 === 0x2002) return false
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && (g5 === 0 || g5 === 0xffff)) {
    return isPublicIpv4(`${g6 >>> 8}.${g6 & 0xff}.${g7 >>> 8}.${g7 & 0xff}`)
  }
  return true
}

function isPublicIpAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return isPublicIpv4(address)
  if (family === 6) return isPublicIpv6(address)
  return false
}

export function evaluatePublicNetworkTarget(input: PublicNetworkTargetInput): PublicTargetDecision {
  let url: URL
  try {
    url = new URL(input.rawUrl)
  } catch {
    return { allowed: false, code: "invalid_url" }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { allowed: false, code: "scheme_not_allowed" }
  if (url.username || url.password) return { allowed: false, code: "credentials_not_allowed" }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { allowed: false, code: "hostname_not_public" }
  }
  if (input.resolvedAddresses.length === 0) return { allowed: false, code: "dns_result_empty" }
  if (!input.resolvedAddresses.every(isPublicIpAddress))
    return { allowed: false, code: "address_not_public" }
  return { allowed: true, canonicalUrl: url.toString(), hostname }
}
