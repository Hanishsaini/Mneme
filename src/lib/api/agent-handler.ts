import { NextResponse, type NextRequest } from "next/server";
import type { ZodSchema } from "zod";
import type { MemberRole } from "@workspace/shared";
import { Errors } from "./errors";
import { toErrorResponse } from "./handler";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { requireMembership } from "@/lib/auth/authz";
import { resolveApiKeyFromRequest } from "@/lib/auth/api-key";

/**
 * Auth wrapper for the agent ingestion surface — the routes an autonomous
 * agent calls through the SDK: opening runs, logging decisions, closing
 * runs. Unlike `withHandler` (session-cookie only), these accept EITHER a
 * logged-in workspace member OR a workspace-scoped Bearer API key, so an
 * unattended agent can authenticate without a browser session.
 *
 * The resolved principal is opaque to the handler; authorization is done
 * via `requireWorkspace`, which knows how to gate each principal kind
 * against a specific workspace. Keeping the two concerns split means a
 * route never has to branch on "session vs key" itself.
 */

export type AgentPrincipal =
  | { kind: "session"; user: SessionUser }
  | { kind: "apiKey"; apiKeyId: string; workspaceId: string };

export interface AgentHandlerContext<Body = unknown, Params = unknown> {
  req: NextRequest;
  principal: AgentPrincipal;
  body: Body;
  params: Params;
}

interface Options<Body, Params> {
  bodySchema?: ZodSchema<Body>;
  paramsSchema?: ZodSchema<Params>;
}

type RouteParams = { params: Promise<Record<string, string>> };

export function withAgentAuth<Body = unknown, Params = unknown, Result = unknown>(
  options: Options<Body, Params>,
  fn: (ctx: AgentHandlerContext<Body, Params>) => Promise<Result>,
) {
  return async (req: NextRequest, route: RouteParams) => {
    try {
      const principal = await resolvePrincipal(req);
      if (!principal) throw Errors.unauthorized();

      let body = undefined as Body;
      if (options.bodySchema) {
        const json = await req.json().catch(() => {
          throw Errors.badRequest("Invalid JSON body");
        });
        body = options.bodySchema.parse(json);
      }

      const rawParams = route?.params ? await route.params : {};
      const params = options.paramsSchema
        ? options.paramsSchema.parse(rawParams)
        : (rawParams as Params);

      const result = await fn({ req, principal, body, params });
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/**
 * Session cookie wins when both are present (a member testing from the
 * browser), otherwise fall back to the Bearer key. Returns null when
 * neither resolves so the caller can 401.
 */
async function resolvePrincipal(
  req: NextRequest,
): Promise<AgentPrincipal | null> {
  const user = await getCurrentUser();
  if (user) return { kind: "session", user };

  const apiKey = await resolveApiKeyFromRequest(req);
  if (apiKey) {
    return {
      kind: "apiKey",
      apiKeyId: apiKey.apiKeyId,
      workspaceId: apiKey.workspaceId,
    };
  }
  return null;
}

/**
 * Assert the principal may act on `workspaceId` at `minRole`.
 *
 * - Session principals defer to `requireMembership` (full role hierarchy).
 * - API-key principals are bound to exactly one workspace at mint time and
 *   carry EDITOR-equivalent rights — enough to open runs and log decisions,
 *   never enough for owner-only operations. A key presented against any
 *   other workspace is a 403, and a request for an owner-level action
 *   through a key is refused outright.
 */
export async function requireWorkspace(
  principal: AgentPrincipal,
  workspaceId: string,
  minRole: MemberRole = "EDITOR",
): Promise<void> {
  if (principal.kind === "session") {
    await requireMembership(principal.user.id, workspaceId, minRole);
    return;
  }
  if (principal.workspaceId !== workspaceId) throw Errors.forbidden();
  if (minRole === "OWNER") throw Errors.forbidden();
}
