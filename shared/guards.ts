import { roleSchema, type Role, type SessionUser } from "./contracts.ts";

export function normalizeRoles(value: unknown): Role[] {
  const rawRoles = Array.isArray(value) ? value : [];
  const validRoles = rawRoles.filter((role): role is Role =>
    roleSchema.safeParse(role).success,
  );

  return Array.from(new Set<Role>(["customer", ...validRoles]));
}

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
