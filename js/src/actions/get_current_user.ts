import { z } from "zod";
import { type Client, type SafeResult } from "../client";

/**
 * Get current user information and validate API token
 *
 * Returns information about the current authenticated user.
 *
 * @example
 * ```typescript
 * import { createClient, getCurrentUser } from '@phala/cloud'
 *
 * const client = createClient({ apiKey: 'your-api-key' })
 * const user = await getCurrentUser(client)
 * // Output: { username: 'alice', email: 'alice@example.com', credits: 1000, ... }
 * ```
 *
 * ## Returns
 *
 * `CurrentUser | unknown`
 *
 * Information about the current user. Return type depends on schema parameter.
 *
 * ## Parameters
 *
 * ### schema (optional)
 *
 * - **Type:** `ZodSchema | false`
 * - **Default:** `CurrentUserSchema`
 *
 * Schema to validate the response. Use `false` to return raw data without validation.
 *
 * ```typescript
 * // Use default schema
 * const user = await getCurrentUser(client)
 *
 * // Return raw data without validation
 * const raw = await getCurrentUser(client, { schema: false })
 *
 * // Use custom schema
 * const customSchema = z.object({ id: z.number(), name: z.string() })
 * const custom = await getCurrentUser(client, { schema: customSchema })
 * ```
 *
 * ## Safe Version
 *
 * Use `safeGetCurrentUser` for error handling without exceptions:
 *
 * ```typescript
 * import { safeGetCurrentUser } from '@phala/cloud'
 *
 * const result = await safeGetCurrentUser(client)
 * if (result.success) {
 *   console.log(result.data.username)
 * } else {
 *   if ("isRequestError" in result.error) {
 *     console.error(`HTTP ${result.error.status}: ${result.error.message}`)
 *   } else {
 *     console.error(`Validation error: ${result.error.issues}`)
 *   }
 * }
 * ```
 */

export const CurrentUserSchema = z
  .object({
    username: z.string(),
    email: z.string(),
    credits: z.number(),
    granted_credits: z.number(),
    avatar: z.string(),
    team_name: z.string(),
    team_tier: z.string(),
  })
  .passthrough();

export type CurrentUser = z.infer<typeof CurrentUserSchema>;

export type GetCurrentUserParameters<T = undefined> = T extends z.ZodSchema
  ? { schema: T }
  : T extends false
    ? { schema: false }
    : { schema?: z.ZodSchema | false };

export type GetCurrentUserReturnType<T = undefined> = T extends z.ZodSchema
  ? z.infer<T>
  : T extends false
    ? unknown
    : CurrentUser;

export async function getCurrentUser<T extends z.ZodSchema | false | undefined = undefined>(
  client: Client,
  parameters?: GetCurrentUserParameters<T>,
): Promise<GetCurrentUserReturnType<T>> {
  const response = await client.get("/auth/me");

  if (parameters?.schema === false) {
    return response as GetCurrentUserReturnType<T>;
  }

  const schema = (parameters?.schema || CurrentUserSchema) as z.ZodSchema;
  return schema.parse(response) as GetCurrentUserReturnType<T>;
}

export async function safeGetCurrentUser<T extends z.ZodSchema | false | undefined = undefined>(
  client: Client,
  parameters?: GetCurrentUserParameters<T>,
): Promise<SafeResult<GetCurrentUserReturnType<T>>> {
  const httpResult = await client.safeGet("/auth/me");

  if (!httpResult.success) {
    return httpResult as SafeResult<GetCurrentUserReturnType<T>>;
  }

  if (parameters?.schema === false) {
    return { success: true, data: httpResult.data } as SafeResult<GetCurrentUserReturnType<T>>;
  }

  const schema = (parameters?.schema || CurrentUserSchema) as z.ZodSchema;
  return schema.safeParse(httpResult.data) as SafeResult<GetCurrentUserReturnType<T>>;
}
