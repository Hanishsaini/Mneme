import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/config/env";
import { CURSOR_COLORS } from "@/config/constants";
import { verifyPassword } from "@/lib/auth/password";
import {
  clearLoginAttempts,
  recordLoginAttempt,
} from "@/lib/redis/login-ratelimit";

/**
 * NextAuth (v4) config. Email + password is the primary auth method;
 * Google / GitHub OAuth remain available when their env keys are set.
 *
 *   - CredentialsProvider verifies bcrypt-hashed passwords against the
 *     User.passwordHash column. Rate-limited per-email through Redis
 *     (5 attempts / 15 min). Successful sign-in clears the bucket.
 *   - Google + GitHub providers are wired when their env keys are set.
 *     OAuth-created users get passwordHash=null and can't sign in via
 *     credentials until they go through a (deferred) password-set flow.
 *   - PrismaAdapter persists OAuth Account/Session rows. Session
 *     strategy stays JWT so route handlers + the realtime token
 *     endpoint stay stateless — credentials providers REQUIRE JWT.
 *   - `events.createUser` fires once per adapter-created User
 *     (OAuth path only). For credentials sign-ups the registration
 *     service provisions the workspace inside the same transaction —
 *     this event isn't invoked.
 */

function buildProviders(): NextAuthOptions["providers"] {
  const env = getServerEnv();
  const providers: NextAuthOptions["providers"] = [];

  // DEMO MODE: `allowDangerousEmailAccountLinking: true` is temporarily enabled
  // so the demo recording flow works (the user hit OAuthAccountNotLinked when
  // attempting to switch providers, and silent failures in the OAuth callback
  // were leaving orphan User rows). MUST be flipped back to false before any
  // public sharing — see [[project-deferred-credential-rotation]] memory.
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }
  if (env.GITHUB_ID && env.GITHUB_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: env.GITHUB_ID,
        clientSecret: env.GITHUB_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  // Email + password — always on. The /register flow creates users with
  // a bcrypt hash; this provider verifies submitted credentials against
  // that hash. Failed attempts are rate-limited per email in Redis so
  // credential-stuffing campaigns hit a wall after a handful of tries.
  providers.push(
    CredentialsProvider({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.trim().toLowerCase();

        const rl = await recordLoginAttempt(email);
        if (!rl.allowed) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        // No account OR OAuth-only user without a password: same outcome,
        // same null return — NextAuth surfaces this as CredentialsSignin
        // and our login form copy doesn't enumerate which case it was.
        if (!user?.passwordHash) return null;

        const ok = await verifyPassword(credentials.password, user.passwordHash);
        if (!ok) return null;

        // Success — wipe the attempts bucket so a future fat-finger doesn't
        // ride on top of today's misses.
        await clearLoginAttempts(email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  );

  return providers;
}

/**
 * LAZY INITIALIZATION
 * `authOptions` used to be a top-level `const` whose initializer called
 * `getServerEnv().NEXTAUTH_SECRET` and `buildProviders()` — both of which
 * trigger full server-env validation. That meant simply *importing* anything
 * that touches auth (every protected route, `getCurrentUser`, etc.) ran env
 * validation at module load, which fails the Vercel `collect page data`
 * build step before user-supplied env vars are even available to the route.
 *
 * The factory + Proxy below defers construction until the first property
 * read, which only happens when NextAuth actually handles a request.
 */
let _authOptions: NextAuthOptions | null = null;
function buildAuthOptions(): NextAuthOptions {
  if (_authOptions) return _authOptions;
  _authOptions = {
    adapter: PrismaAdapter(prisma),
    session: { strategy: "jwt" },
    secret: getServerEnv().NEXTAUTH_SECRET,
    providers: buildProviders(),
    pages: {
      signIn: "/login",
      error: "/login",
    },
    callbacks: {
      async jwt({ token, user }) {
        if (user) token.uid = user.id;
        return token;
      },
      async session({ session, token }) {
        if (token.uid && session.user) {
          (session.user as { id?: string }).id = token.uid as string;
        }
        return session;
      },
    },
    events: {
      /**
       * Fires exactly once per User row creation — i.e. the moment an OAuth
       * sign-in lands a brand new account. Provision a personal workspace so
       * the user has somewhere to go immediately after auth.
       *
       * Credentials sign-ins bypass the adapter and never reach this event,
       * which is correct: seeded dev users (Alice/Bob) come with their
       * workspaces already created by the seed script.
       */
      async createUser({ user }) {
        const firstName = user.name?.split(" ")[0]?.trim();
        const workspaceName = firstName
          ? `${firstName}'s workspace`
          : "Personal workspace";

        await prisma.workspace.create({
          data: {
            name: workspaceName,
            ownerId: user.id,
            members: {
              create: {
                userId: user.id,
                role: "OWNER",
                cursorColor: CURSOR_COLORS[0],
              },
            },
            conversations: { create: { title: "New conversation" } },
            canvases: { create: { type: "NOTES", snapshot: { blocks: [] } } },
          },
        });
      },
    },
  };
  return _authOptions;
}

export const authOptions: NextAuthOptions = new Proxy(
  {} as NextAuthOptions,
  {
    get(_t, prop) {
      return Reflect.get(buildAuthOptions(), prop);
    },
  },
);
