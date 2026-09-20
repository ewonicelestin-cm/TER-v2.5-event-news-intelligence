import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export type Role = "ADMIN" | "ANALYST" | "VIEWER";
export interface User { id: string; email: string; role: Role; active: boolean; createdAt: string; }
interface StoredUser extends User { passwordHash: string; salt: string; }
interface Session { tokenHash: string; userId: string; expiresAt: number; }

const users = new Map<string, StoredUser>();
const sessions = new Map<string, Session>();
const buckets = new Map<string, { start: number; count: number }>();

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const maxRequests = Number(process.env.RATE_LIMIT_MAX || 180);
const sessionHours = Number(process.env.SESSION_HOURS || 12);

function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function hashPassword(password: string, salt: string) { return scryptSync(password, salt, 64).toString("hex"); }
function safeUser(u: StoredUser): User { const { passwordHash: _p, salt: _s, ...safe } = u; return safe; }

export function seedDemoAdmin() {
  if (users.size) return;
  const email = (process.env.DEMO_ADMIN_EMAIL || "admin@ter.local").toLowerCase();
  const password = process.env.DEMO_ADMIN_PASSWORD || "change-me-now";
  const salt = randomBytes(16).toString("hex");
  users.set(email, { id: "demo-admin", email, role: "ADMIN", active: true, createdAt: new Date().toISOString(), salt, passwordHash: hashPassword(password, salt) });
}

export function registerUser(email: string, password: string, role: Role = "VIEWER") {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new Error("invalid email");
  if (password.length < 12) throw new Error("password must contain at least 12 characters");
  if (users.has(normalized)) throw new Error("email already registered");
  const salt = randomBytes(16).toString("hex");
  const user: StoredUser = { id: randomBytes(12).toString("hex"), email: normalized, role, active: true, createdAt: new Date().toISOString(), salt, passwordHash: hashPassword(password, salt) };
  users.set(normalized, user); return safeUser(user);
}

export function login(email: string, password: string) {
  const user = users.get(email.trim().toLowerCase());
  if (!user || !user.active) return null;
  const candidate = Buffer.from(hashPassword(password, user.salt), "hex");
  const actual = Buffer.from(user.passwordHash, "hex");
  if (candidate.length !== actual.length || !timingSafeEqual(candidate, actual)) return null;
  const token = randomBytes(32).toString("base64url");
  sessions.set(hashToken(token), { tokenHash: hashToken(token), userId: user.id, expiresAt: Date.now() + sessionHours * 3600_000 });
  return { token, user: safeUser(user), expiresAt: new Date(Date.now() + sessionHours * 3600_000).toISOString() };
}

export function authenticate(token?: string) {
  if (!token) return null;
  const session = sessions.get(hashToken(token));
  if (!session || session.expiresAt <= Date.now()) { if (session) sessions.delete(session.tokenHash); return null; }
  const user = [...users.values()].find(u => u.id === session.userId);
  return user && user.active ? safeUser(user) : null;
}

export function requireRole(user: User | null, roles: Role[]) { return !!user && roles.includes(user.role); }

export function rateLimit(key: string) {
  const now = Date.now(); const current = buckets.get(key);
  if (!current || now - current.start >= windowMs) { buckets.set(key, { start: now, count: 1 }); return { allowed: true, remaining: maxRequests - 1 }; }
  current.count += 1; return { allowed: current.count <= maxRequests, remaining: Math.max(0, maxRequests - current.count) };
}

export function securityStatus() { return { authEnabled: process.env.AUTH_ENABLED === "true", users: users.size, activeSessions: [...sessions.values()].filter(s => s.expiresAt > Date.now()).length, rateLimit: { windowMs, maxRequests } }; }
