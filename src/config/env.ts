import { z } from "zod";

/**
 * Server-side environment. Validated lazily on first access — fail fast on a
 * misconfigured deploy, but never throw just because a client component
 * imported this file for `clientEnv`.
 *
 * Free-tier philosophy: AI keys are ALL optional (zero keys → mock mode),
 * and the auth/realtime secrets carry dev defaults so `pnpm dev` works with
 * no manual config. Override every secret in production.
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

  // ── Auth — dev defaults baked in; CHANGE IN PROD ──────────────────────
  NEXTAUTH_URL: z.preprocess(
    empty,
    z.string().url().default("http://localhost:3000"),
  ),
  NEXTAUTH_SECRET: z.preprocess(
    empty,
    z.string().min(1).default("dev-only-insecure-secret-change-me"),
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

  // ── Realtime — dev defaults; MUST match the socket server's values ───
  SOCKET_SERVER_URL: z.preprocess(
    empty,
    z.string().url().default("http://localhost:4000"),
  ),
  REALTIME_TOKEN_SECRET: z.preprocess(
    empty,
    z.string().min(16).default("dev-only-realtime-secret-change!"),
  ),
  SERVICE_TOKEN: z.preprocess(
    empty,
    z.string().min(16).default("dev-only-service-token-change!!!"),
  ),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SOCKET_URL: z.preprocess(
    empty,
    z.string().url().default("http://localhost:4000"),
  ),
});

function format(error: z.ZodError): never {
  const issues = error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment variables:\n${issues}`);
}

const _client = clientSchema.safeParse({
  NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL,
});
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
