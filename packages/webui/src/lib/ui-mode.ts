import type { UiMode } from "../api/client"
import {
  type UiRouteInventoryItem,
  type UiRouteMigrationResult,
  getDeprecatedUiRoutes,
  getUiRouteInventory,
  resolveLegacyAdvancedRoute,
  resolveModeSwitchRoute,
  resolveRollbackRoute,
  resolveRouteMigration,
  resolveUnifiedRoute,
} from "./route-migration"

export {
  getDeprecatedUiRoutes,
  getUiRouteInventory,
  resolveLegacyAdvancedRoute,
  resolveModeSwitchRoute,
  resolveRollbackRoute,
  resolveRouteMigration,
  resolveUnifiedRoute,
  type UiRouteInventoryItem,
  type UiRouteMigrationResult,
}

export interface UiNavItem {
  path: string
  labelKo: string
  labelEn: string
  capabilityKey?: string
  descriptionKo?: string
  descriptionEn?: string
  adminOnly?: boolean
}

const UNIFIED_NAV: UiNavItem[] = [
  {
    path: "/chat",
    labelKo: "대화",
    labelEn: "Chat",
    capabilityKey: "chat.workspace",
    descriptionKo: "요청과 결과 확인",
    descriptionEn: "Requests and results",
  },
  {
    path: "/settings",
    labelKo: "설정",
    labelEn: "Settings",
    capabilityKey: "setup.wizard",
    descriptionKo: "AI, 채널, 연장 연결",
    descriptionEn: "AI, channel, and extension connections",
  },
  {
    path: "/agents",
    labelKo: "서브 에이전트 설정",
    labelEn: "Sub-Agent Settings",
    capabilityKey: "enterprise_topology_builder_ui",
    descriptionKo: "에이전트 추가와 위임 구조",
    descriptionEn: "Agents and delegation structure",
  },
  {
    path: "/capabilities/skills",
    labelKo: "기능 연결",
    labelEn: "Capabilities",
    descriptionKo: "Skills와 MCP 관리",
    descriptionEn: "Manage Skills and MCP",
  },
  {
    path: "/work/runs",
    labelKo: "실행 기록",
    labelEn: "Run History",
    capabilityKey: "runs.monitor",
    descriptionKo: "진행과 결과 확인",
    descriptionEn: "Progress and results",
  },
  {
    path: "/status",
    labelKo: "관리",
    labelEn: "Management",
    capabilityKey: "dashboard.overview",
    descriptionKo: "상태와 진단 요약",
    descriptionEn: "Status and diagnostics summary",
  },
]

const ADMIN_NAV: UiNavItem[] = [
  {
    path: "/admin",
    labelKo: "Admin",
    labelEn: "Admin",
    descriptionKo: "개발자 진단 도구",
    descriptionEn: "Developer diagnostics",
    adminOnly: true,
  },
]

export function getUiNavigation(_mode: UiMode, adminEnabled: boolean): UiNavItem[] {
  return adminEnabled ? [...UNIFIED_NAV, ...ADMIN_NAV] : UNIFIED_NAV
}

export function isAdvancedRoute(pathname: string): boolean {
  return pathname === "/advanced" || pathname.startsWith("/advanced/")
}

export function isAdminRoute(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/")
}
