import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import * as schema from "../db/auth-schema.ts";
import { roleSchema, type Role, type SessionUser } from "../shared/contracts.ts";

// ─── Startup guard ────────────────────────────────────────────────────────────
// BETTER_AUTH_SECRET 必須在啟動時存在且不為佔位值，
// 否則 session 簽名金鑰會不安全，讓問題在啟動期明確報錯而非靜默失敗。
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret || secret === "replaceme") {
  throw new Error(
    "BETTER_AUTH_SECRET is required and must not be 'replaceme'. " +
      "Generate one with: bun -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

// trustedOrigins：CSRF 白名單。預設信任 baseURL。
// API_ALLOWED_ORIGIN 設定時（如 Vite dev server http://localhost:5173）一併加入，
// 讓跨 port 開發場景的 sign-out 不會被 CSRF 保護擋住。
const extraOrigin = process.env.API_ALLOWED_ORIGIN;
const trustedOrigins =
  extraOrigin && extraOrigin !== "*" ? [baseURL, extraOrigin] : [baseURL];

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const isGoogleProviderConfigured = Boolean(
  googleClientId && googleClientSecret,
);
const bootstrapAdminEmails = new Set(
  (process.env.RBAC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
const defaultRoles: Role[] = ["customer"];

function normalizeRoles(value: unknown): Role[] {
  const source = Array.isArray(value) ? value : [];
  const roles = source.filter((role): role is Role => {
    return roleSchema.safeParse(role).success;
  });

  if (!roles.includes("customer")) {
    roles.unshift("customer");
  }

  return [...new Set(roles)];
}

function parseStoredRoles(value: unknown): Role[] {
  const source = Array.isArray(value) ? value : [];
  return source.filter((role): role is Role => {
    return roleSchema.safeParse(role).success;
  });
}

function shouldBootstrapAdmin(email: string): boolean {
  return bootstrapAdminEmails.has(email.trim().toLowerCase());
}

function haveSameRoles(a: readonly Role[], b: readonly Role[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((role) => b.includes(role));
}

// ─── Better Auth instance ─────────────────────────────────────────────────────
// V10.1：只使用 Google OAuth 登入，不提供 email/password 方式。
// auth tables（user / session / account / verification）存在 bf_v10 schema 下，
// 與業務 tables（menu_items / orders / order_items）並存於同一 DB。
export const auth = betterAuth({
  baseURL,
  secret,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: false, // ✅ 禁用 email/password 登入
  },
  ...(isGoogleProviderConfigured
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId!,
            clientSecret: googleClientSecret!,
          },
        },
      }
    : {}),
});

// ─── Session helper ───────────────────────────────────────────────────────────
// 從 Request headers 取出 session，轉換成 contracts.ts 定義的 SessionUser。
// DB 層的 Better Auth user 欄位（emailVerified / image / createdAt 等）
// 不對外暴露，只取 contracts.ts 中定義的三個欄位。
export async function getCurrentUser(
  request: Request,
): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;

  const [dbUser] = await db
    .select({
      roles: schema.user.roles,
    })
    .from(schema.user)
    .where(eq(schema.user.id, session.user.id))
    .limit(1);

  const currentDbRoles = parseStoredRoles(dbUser?.roles ?? defaultRoles);
  const storedRoles = normalizeRoles(dbUser?.roles ?? defaultRoles);
  const nextRoles = shouldBootstrapAdmin(session.user.email)
    ? normalizeRoles([...storedRoles, "admin"])
    : storedRoles;

  if (!haveSameRoles(currentDbRoles, nextRoles)) {
    await db
      .update(schema.user)
      .set({
        roles: nextRoles,
        updatedAt: new Date(),
      })
      .where(eq(schema.user.id, session.user.id));
  }

  // DbUser → SessionUser 轉換（延續 02_4 講義的分層原則）
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    roles: nextRoles,
  };
}
