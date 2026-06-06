/** Typed API errors mapped to HTTP status codes by the route wrapper. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    /** Extra response headers to set on the error response (e.g.
     *  `Retry-After` on a 429). Applied by `toErrorResponse`. */
    public headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const Errors = {
  unauthorized: () => new ApiError(401, "Unauthorized", "UNAUTHORIZED"),
  forbidden: () => new ApiError(403, "Forbidden", "FORBIDDEN"),
  notFound: (what = "Resource") =>
    new ApiError(404, `${what} not found`, "NOT_FOUND"),
  badRequest: (message = "Bad request") =>
    new ApiError(400, message, "BAD_REQUEST"),
  conflict: (message = "Conflict") => new ApiError(409, message, "CONFLICT"),
  /** 429. Pass `retryAfterSeconds` to emit a `Retry-After` header so a
   *  well-behaved client knows exactly when to retry. */
  rateLimited: (retryAfterSeconds?: number) =>
    new ApiError(
      429,
      "Too many requests",
      "RATE_LIMITED",
      retryAfterSeconds != null
        ? { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))) }
        : undefined,
    ),
  internal: () =>
    new ApiError(500, "Internal server error", "INTERNAL"),
};
