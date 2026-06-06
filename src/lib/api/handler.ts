import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { ApiError, Errors } from "./errors";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";

/**
 * Route handler wrapper. Centralizes auth resolution, body validation, and
 * error → JSON mapping so individual handlers stay thin and consistent.
 */

export interface HandlerContext<Body = unknown, Params = unknown> {
  req: NextRequest;
  user: SessionUser;
  body: Body;
  params: Params;
}

interface Options<Body, Params> {
  /** Require an authenticated session (default true). */
  auth?: boolean;
  /** Zod schema for the JSON body; parsed result lands in ctx.body. */
  bodySchema?: ZodSchema<Body>;
  /** Zod schema for the resolved route params. */
  paramsSchema?: ZodSchema<Params>;
}

type RouteParams = { params: Promise<Record<string, string>> };

export function withHandler<Body = unknown, Params = unknown, Result = unknown>(
  options: Options<Body, Params>,
  fn: (ctx: HandlerContext<Body, Params>) => Promise<Result>,
) {
  return async (req: NextRequest, route: RouteParams) => {
    try {
      const requireAuth = options.auth !== false;
      const user = await getCurrentUser();
      if (requireAuth && !user) throw Errors.unauthorized();

      let body = undefined as Body;
      if (options.bodySchema) {
        const json = await req.json().catch(() => {
          throw Errors.badRequest("Invalid JSON body");
        });
        body = options.bodySchema.parse(json);
      }

      let params = undefined as Params;
      const rawParams = route?.params ? await route.params : {};
      if (options.paramsSchema) {
        params = options.paramsSchema.parse(rawParams);
      } else {
        params = rawParams as Params;
      }

      const result = await fn({
        req,
        user: user as SessionUser,
        body,
        params,
      });

      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status, headers: err.headers },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", code: "VALIDATION", issues: err.issues },
      { status: 422 },
    );
  }
  if (err instanceof Error && err.name === "UnauthorizedError") {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  console.error("[api] unhandled error:", err);
  return NextResponse.json(
    { error: "Internal server error", code: "INTERNAL" },
    { status: 500 },
  );
}
