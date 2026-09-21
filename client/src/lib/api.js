/**
 * The single place the client talks to the API. Every call sends the session
 * cookie and every failure arrives as an ApiError with the server's own code,
 * message and per-field errors, so pages never parse responses themselves.
 */
const BASE = '/api';

export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields ?? null;
  }

  get isUnauthenticated() {
    return this.status === 401;
  }
}

async function request(method, path, body) {
  const options = { method, credentials: 'include', headers: {} };

  if (method !== 'GET') {
    // The API rejects mutating requests that do not declare JSON, so the
    // header goes on even when there is no body to send.
    options.headers['Content-Type'] = 'application/json';
    if (body !== undefined) options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${BASE}${path}`, options);
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach the server. Is it running?');
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    /* a non-JSON body means something upstream went wrong */
  }

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? `Request failed with status ${response.status}.`,
      error?.fields,
    );
  }

  return payload;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
};
