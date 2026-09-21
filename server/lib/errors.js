/**
 * Every error the API returns to a client is an ApiError, so the response shape
 * is decided in one place: { error: { code, message, fields? } }.
 */
export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (fields) this.fields = fields;
  }

  /** 400 - the request itself is malformed. */
  static badRequest(message, fields) {
    return new ApiError(400, 'BAD_REQUEST', message, fields);
  }

  /** 401 - no valid session. */
  static unauthenticated(message = 'Authentication required.') {
    return new ApiError(401, 'UNAUTHENTICATED', message);
  }

  /** 403 - authenticated, but not allowed to touch this resource. */
  static forbidden(message = 'You do not have access to this resource.') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  /** 404 - no such resource, or none visible to this user. */
  static notFound(message = 'Resource not found.') {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  /** 409 - conflicts with existing state, e.g. a taken username. */
  static conflict(message, fields) {
    return new ApiError(409, 'CONFLICT', message, fields);
  }

  /** 422 - well-formed but semantically invalid, e.g. a value out of range. */
  static unprocessable(message, fields) {
    return new ApiError(422, 'UNPROCESSABLE', message, fields);
  }

  /** 429 - throttled. */
  static tooManyRequests(message = 'Too many attempts. Try again later.') {
    return new ApiError(429, 'TOO_MANY_REQUESTS', message);
  }
}
