import { z } from "zod";

/**
 * Server-side environment. Validated lazily on first access — fail fast on a
 * misconfigured deploy, but never throw just because a client component
 * imported this file for `clientEnv`.
 *
 * PRODUCTION DEFAULTS POLICY
 * Dev-default fallbacks (`dev-only-…` strings) are convenient for `pnpm dev`
 * but catastrophic if they ever land in production. Every secret-shaped
 * field is guarded by `requireInProduction` — present a dev default when
 * NODE_ENV !== "production", reject as required when it is. So a Vercel
 * deploy with a missing NEXTAUTH_SECRET fails the env parse loudly instead
 * of silently signing JWTs with the public dev string.
 *
 * EMPTY-STRING NORMALIZATION
 * .env files commonly carry placeholder lines like `GROQ_API_KEY=""` that
 * developers leave in rather than deleting. Out of the box Zod treats `""`
 * as a present value, which then fails `.url()`, `.min(N)`, or `.enum(...)`
 * checks and short-circuits `.default(...)` (which only fires on undefined).
 * Every field below runs through the `empty` preprocess so `""` is treated
 * as missing — `.optional()` and `.default()` then behave the way a reader
 * of the .env file expects.
 */

/** Treat empty strings as missing. Applied uniformly to every env field. */
const empty = (v: unknown) => (v === "" ? undefined : v);

const isProd = process.env.NODE_ENV === "production";

/**
 * In production: require a real value (no defaults — Zod throws if missing).
 * In dev/test: fall back to the supplied dev string so `pnpm dev` works
 * without a populated .env.local.
 *
 * The schema is constructed once at parse time, so the prod/dev branch is
 * decided when the module loads. That's the right shape for Next.js
 * deployments where NODE_ENV is fixed for the lifetime of the process.
 */
function requireInProduction(devDefault: string, minLength = 1) {
  const base = z.string().min(minLength);
  return isProd ? base : base.default(devDefault);
}

const serverSchema = z.object({
  // ── Infra — required ───────────────────────────────────────────────────
  DATABASE_URL: z.preprocess(empty, z.string().url()),
  DIRECT_URL: z.preprocess(empty, z.string().url().optional()),
  REDIS_URL: z.preprocess(empty, z.string().url()),

  // ── AI — all optional; zero keys → mock provider ──────────────────────
  AI_PROVIDER: z.preprocess(
    empty,
    z.enum(["auto", "groq", "gemini", "openai", "mock"]).default("auto"),
  ),
  GROQ_API_KEY: z.preprocess(empty, z.string().optional()),
  GROQ_MODEL: z.preprocess(
    empty,
    z.string().default("llama-3.3-70b-versatile"),
  ),
  GEMINI_API_KEY: z.preprocess(empty, z.string().optional()),
  GEMINI_MODEL: z.preprocess(empty, z.string().default("gemini-2.5-flash")),
  OPENAI_API_KEY: z.preprocess(empty, z.string().optional()),
  OPENAI_MODEL: z.preprocess(empty, z.string().default("gpt-4o-mini")),

  // ── Auth — secrets MUST be set in production ─────────────────────────
  NEXTAUTH_URL: z.preprocess(
    empty,
    z.string().url().default("http://localhost:3000"),
  ),
  /**
   * Signs every NextAuth JWT in the app. Production deploys MUST set this
   * to a high-entropy random string (32+ chars). In dev, a deterministic
   * dev string lets `pnpm dev` work with no .env.local.
   */
  NEXTAUTH_SECRET: z.preprocess(
    empty,
    requireInProduction("dev-only-insecure-secret-change-me", 32),
  ),
  GITHUB_ID: z.preprocess(empty, z.string().optional()),
  GITHUB_SECRET: z.preprocess(empty, z.string().optional()),
  GOOGLE_CLIENT_ID: z.preprocess(empty, z.string().optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess(empty, z.string().optional()),
  /**
   * Dev-only CredentialsProvider gate. `"true"` forces on, `"false"` forces
   * off, undefined → on outside production / off in production. Empty
   * string in .env is normalized to undefined upstream.
   */
  ENABLE_DEV_LOGIN: z.preprocess(
    empty,
    z.enum(["true", "false"]).optional(),
  ),
  /** Seed fixture gates — undefined / empty → no-op. */
  SEED_DEV_USERS: z.preprocess(
    empty,
    z.enum(["true", "false"]).optional(),
  ),
  SEED_DEMO_SHARED: z.preprocess(
    empty,
    z.enum(["true", "false"]).optional(),
  ),
});

const clientSchema = z.object({});

function format(error: z.ZodError): never {
  const issues = error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment variables:\n${issues}`);
}

const _client = clientSchema.safeParse({});
if (!_client.success) format(_client.error);

/** Safe to read in both server and client bundles. */
export const clientEnv = _client.data;

let _serverEnv: z.infer<typeof serverSchema> | null = null;

/**
 * Server-only env. Lazily parsed so importing this file from a client
 * component (for `clientEnv`) does not throw on missing server vars.
 */
export function getServerEnv() {
  if (_serverEnv) return _serverEnv;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) format(parsed.error);
  _serverEnv = parsed.data;
  return _serverEnv;
}
