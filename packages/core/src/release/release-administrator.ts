export interface ReleaseAdministratorPrincipal {
  principalType: "authenticated_user" | "system"
  principalId: string
  authenticationId: string
  roles: readonly string[]
}
