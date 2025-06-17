import { z } from "zod";
import type { FetchError, FetchOptions, FetchRequest } from "ofetch";

/**
 * API Error Response Schema
 */
export const ApiErrorSchema = z.object({
  detail: z.union([
    z.string(),
    z.array(
      z.object({
        msg: z.string(),
        type: z.string().optional(),
        ctx: z.record(z.unknown()).optional(),
      }),
    ),
    z.record(z.unknown()),
  ]),
  type: z.string().optional(),
  code: z.string().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Enhanced error type that includes both HTTP and validation errors
 */
export type SafeError = RequestError | z.ZodError;

/**
 * Result type for safe operations, similar to zod's SafeParseResult
 * Enhanced to handle both HTTP and validation errors by default
 */
export type SafeResult<T, E = SafeError> =
  | { success: true; data: T; error?: never }
  | { success: false; data?: never; error: E };

/**
 * Base error class for HTTP requests
 * Compatible with ApiError interface for Result type compatibility
 */
export class RequestError extends Error implements ApiError {
  public readonly name = "RequestError";
  public readonly isRequestError = true as const; // Type discriminator
  public readonly status?: number | undefined;
  public readonly statusText?: string | undefined;
  public readonly data?: unknown;
  public readonly request?: FetchRequest | undefined;
  public readonly response?: Response | undefined;

  // ApiError interface properties
  public readonly detail:
    | string
    | Record<string, unknown>
    | Array<{ msg: string; type?: string; ctx?: Record<string, unknown> }>;
  public readonly code?: string | undefined;
  public readonly type?: string | undefined;

  constructor(
    message: string,
    options?: {
      status?: number | undefined;
      statusText?: string | undefined;
      data?: unknown;
      request?: FetchRequest | undefined;
      response?: Response | undefined;
      cause?: unknown;
      detail?:
        | string
        | Record<string, unknown>
        | Array<{ msg: string; type?: string; ctx?: Record<string, unknown> }>;
      code?: string | undefined;
      type?: string | undefined;
    },
  ) {
    super(message);

    this.status = options?.status;
    this.statusText = options?.statusText;
    this.data = options?.data;
    this.request = options?.request;
    this.response = options?.response;
    this.detail = options?.detail || message;
    this.code = options?.code;
    this.type = options?.type;
  }

  /**
   * Create RequestError from FetchError
   */
  static fromFetchError(error: FetchError): RequestError {
    // Try to parse the error response as ApiError
    const parseResult = ApiErrorSchema.safeParse(error.data);

    if (parseResult.success) {
      return new RequestError(error.message, {
        status: error.status ?? undefined,
        statusText: error.statusText ?? undefined,
        data: error.data,
        request: error.request ?? undefined,
        response: error.response ?? undefined,
        detail: parseResult.data.detail as
          | string
          | Record<string, unknown>
          | Array<{
              msg: string;
              type?: string;
              ctx?: Record<string, unknown>;
            }>,
        code: parseResult.data.code ?? undefined,
        type: parseResult.data.type ?? undefined,
      });
    }

    // Fallback to raw error data
    return new RequestError(error.message, {
      status: error.status ?? undefined,
      statusText: error.statusText ?? undefined,
      data: error.data,
      request: error.request ?? undefined,
      response: error.response ?? undefined,
      detail: error.data?.detail || "Unknown API error",
      code: error.status?.toString() ?? undefined,
    });
  }

  /**
   * Create RequestError from generic Error
   */
  static fromError(error: Error, request?: FetchRequest): RequestError {
    return new RequestError(error.message, {
      request: request ?? undefined,
      detail: error.message,
    });
  }
}

/**
 * Client configuration - extends FetchOptions and adds predefined API-specific options
 *
 * Environment Variables:
 * - PHALA_CLOUD_API_KEY: API key for authentication
 * - PHALA_CLOUD_API_PREFIX: Base URL prefix for the API
 */
export interface ClientConfig extends FetchOptions {
  /**
   * API key for authentication
   * If not provided, will read from PHALA_CLOUD_API_KEY environment variable
   */
  apiKey?: string;
  /**
   * Base URL for the API (overrides FetchOptions baseURL)
   * If not provided, will read from PHALA_CLOUD_API_PREFIX environment variable
   * Defaults to "https://cloud-api.phala.network/v1"
   */
  baseURL?: string;
  /** Default timeout in milliseconds (overrides FetchOptions timeout) */
  timeout?: number;
}
