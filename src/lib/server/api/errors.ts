/**
 * Typed API errors — same wire shape as the former NestJS API:
 * { message: string, issues?: { path: string, message: string }[] }
 */
export interface Issue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  issues?: Issue[];

  constructor(status: number, message: string, issues?: Issue[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }
}

export const badRequest = (message = 'Bad request', issues?: Issue[]) => new ApiError(400, message, issues);
export const validationFailed = (issues?: Issue[]) => new ApiError(400, 'Validation failed', issues);
export const unauthorized = (message = 'Not authenticated') => new ApiError(401, message);
export const forbidden = (message = 'Forbidden') => new ApiError(403, message);
export const notFound = (message = 'Not found') => new ApiError(404, message);
export const conflict = (message = 'Conflict') => new ApiError(409, message);
export const payloadTooLarge = (message = 'Payload too large') => new ApiError(413, message);
export const tooManyRequests = (message = 'Too many requests') => new ApiError(429, message);
export const internal = (message = 'Internal server error') => new ApiError(500, message);
