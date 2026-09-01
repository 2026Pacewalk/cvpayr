import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { ALL_PERMISSIONS, type PermissionKey } from "./permissions";
import { safeJsonParse } from "./utils";

const COOKIE = "carvyapar_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

type TokenPayload = { sub: string };

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

async function issueToken(userId: string) {
  return new SignJWT({ sub: userId } satisfies TokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function createSession(userId: string) {
  const token = await issueToken(userId);
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

/**
 * The authenticated principal. `dealerId` is the tenant boundary: every query in
 * src/server/* is scoped by it, and it is never taken from user input.
 */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  designation: string | null;
  isSuperAdmin: boolean;
  dealerId: string | null;
  dealerName: string | null;
  dealerSlug: string | null;
  dealerStatus: string | null;
  roleKey: string | null;
  roleName: string | null;
  permissions: PermissionKey[];
  /** Empty array = access to every branch of the dealer. */
  branchIds: string[];
};

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    userId = String(payload.sub);
  } catch {
    return null;
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      role: true,
      dealer: { select: { id: true, name: true, slug: true, status: true } },
      branches: { select: { branchId: true } },
    },
  });

  if (!user || !user.isActive) return null;

  const permissions: PermissionKey[] = user.isSuperAdmin
    ? ALL_PERMISSIONS
    : safeJsonParse<PermissionKey[]>(user.role?.permissions, []);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    designation: user.designation,
    isSuperAdmin: user.isSuperAdmin,
    dealerId: user.dealerId,
    dealerName: user.dealer?.name ?? null,
    dealerSlug: user.dealer?.slug ?? null,
    dealerStatus: user.dealer?.status ?? null,
    roleKey: user.role?.key ?? null,
    roleName: user.role?.name ?? (user.isSuperAdmin ? "Super Admin" : null),
    permissions,
    branchIds: user.branches.map((b) => b.branchId),
  };
}

/** Dealer-side pages. Redirects to login, or to the admin console for platform staff. */
export async function requireDealerUser(): Promise<SessionUser & { dealerId: string }> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.dealerId) redirect("/admin");
  return session as SessionUser & { dealerId: string };
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  // Dealer staff land back on their own dashboard with an explanation rather than
  // a silent bounce, which otherwise reads as a broken page.
  if (!session.isSuperAdmin) redirect("/dashboard?denied=admin");
  return session;
}

export async function authenticate(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.isActive) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
}
