import type { Role, SessionUser } from "./contracts.ts";

export function hasRole(user: SessionUser, role: Role): boolean {
  return user.roles.includes(role);
}

export function hasAnyRole(
  user: SessionUser,
  roles: readonly Role[],
): boolean {
  return roles.some((role) => hasRole(user, role));
}

export function hasAllRoles(
  user: SessionUser,
  roles: readonly Role[],
): boolean {
  return roles.every((role) => hasRole(user, role));
}

export function requireAnyRole(
  user: SessionUser,
  roles: readonly Role[],
): void {
  if (hasAnyRole(user, roles)) return;

  throw new Response(
    JSON.stringify({
      error: "Forbidden",
      message: `Required one of roles: ${roles.join(", ")}`,
    }),
    {
      status: 403,
      headers: { "Content-Type": "application/json" },
    },
  );
}
