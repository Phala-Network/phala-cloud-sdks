import { z } from "zod";
import { type Client, type SafeResult } from "../client";

/**
 * Commit CVM compose file update
 *
 * Finalizes a CVM compose file update by committing the previously provisioned changes.
 * This should be called after `provisionCvmComposeFileUpdate` to complete the update process.
 *
 * @example
 * ```typescript
 * import { createClient, commitCvmComposeFileUpdate } from '@phala/cloud'
 *
 * const client = createClient({ apiKey: 'your-api-key' })
 * await commitCvmComposeFileUpdate(client, {
 *   cvm_id: 'cvm-123',
 *   request: {
 *     compose_hash: 'abc123...'
 *   }
 * })
 * // Request accepted, update will be processed asynchronously
 * ```
 *
 * ## Returns
 *
 * `void | unknown`
 *
 * No response body (HTTP 202 Accepted). The update is processed asynchronously. Return type depends on schema parameter.
 *
 * ## Parameters
 *
 * ### cvm_id (required)
 *
 * - **Type:** `string`
 *
 * The CVM ID to commit compose file update for. Can be either an app_id or vm_uuid.
 *
 * ### request (required)
 *
 * - **Type:** `CommitCvmComposeFileUpdateRequest`
 *
 * The commit request containing compose_hash.
 *
 * ### schema (optional)
 *
 * - **Type:** `ZodSchema | false`
 * - **Default:** `CommitCvmComposeFileUpdateSchema`
 *
 * Schema to validate the response. Use `false` to return raw data without validation.
 *
 * ```typescript
 * // Use default schema (void response)
 * await commitCvmComposeFileUpdate(client, { cvm_id: 'cvm-123', request: commitRequest })
 *
 * // Return raw data without validation
 * const raw = await commitCvmComposeFileUpdate(client, { cvm_id: 'cvm-123', request: commitRequest, schema: false })
 *
 * // Use custom schema
 * const customSchema = z.object({ status: z.string() })
 * const custom = await commitCvmComposeFileUpdate(client, { cvm_id: 'cvm-123', request: commitRequest, schema: customSchema })
 * ```
 *
 * ## Safe Version
 *
 * Use `safeCommitCvmComposeFileUpdate` for error handling without exceptions:
 *
 * ```typescript
 * import { safeCommitCvmComposeFileUpdate } from '@phala/cloud'
 *
 * const result = await safeCommitCvmComposeFileUpdate(client, { cvm_id: 'cvm-123', request: commitRequest })
 * if (result.success) {
 *   console.log('Compose file update committed successfully')
 * } else {
 *   if ("isRequestError" in result.error) {
 *     console.error(`HTTP ${result.error.status}: ${result.error.message}`)
 *   } else {
 *     console.error(`Validation error: ${result.error.issues}`)
 *   }
 * }
 * ```
 */

export const CommitCvmComposeFileUpdateRequestSchema = z
  .object({
    compose_hash: z.string(),
    encrypted_env: z.string().optional(),
    env_keys: z.array(z.string()).optional(),
  })
  .passthrough();

export const CommitCvmComposeFileUpdateSchema = z.any().transform(() => undefined);

export type CommitCvmComposeFileUpdateRequest = z.infer<
  typeof CommitCvmComposeFileUpdateRequestSchema
>;
export type CommitCvmComposeFileUpdate = undefined;

export type CommitCvmComposeFileUpdateParameters<T = undefined> = {
  cvm_id: string;
  request: CommitCvmComposeFileUpdateRequest;
} & (T extends z.ZodSchema
  ? { schema: T }
  : T extends false
    ? { schema: false }
    : { schema?: z.ZodSchema | false });

export type CommitCvmComposeFileUpdateReturnType<T = undefined> = T extends z.ZodSchema
  ? z.infer<T>
  : T extends false
    ? unknown
    : CommitCvmComposeFileUpdate;

export async function commitCvmComposeFileUpdate<
  T extends z.ZodSchema | false | undefined = undefined,
>(
  client: Client,
  parameters: CommitCvmComposeFileUpdateParameters<T>,
): Promise<CommitCvmComposeFileUpdateReturnType<T>> {
  const { cvm_id, request, ...options } = parameters;

  if (!cvm_id || cvm_id.trim() === "") {
    throw new Error("CVM ID is required");
  }

  if (!request.compose_hash || request.compose_hash.trim() === "") {
    throw new Error("Compose hash is required");
  }

  const result = await client.safePatch(`/cvms/${cvm_id}/compose_file`, request);
  if (!result.success) {
    throw result.error;
  }

  if (options.schema === false) {
    return result.data as CommitCvmComposeFileUpdateReturnType<T>;
  }

  const schema = (options.schema || CommitCvmComposeFileUpdateSchema) as z.ZodSchema;
  return schema.parse(result.data) as CommitCvmComposeFileUpdateReturnType<T>;
}

export async function safeCommitCvmComposeFileUpdate<
  T extends z.ZodSchema | false | undefined = undefined,
>(
  client: Client,
  parameters: CommitCvmComposeFileUpdateParameters<T>,
): Promise<SafeResult<CommitCvmComposeFileUpdateReturnType<T>>> {
  const { cvm_id, request, ...options } = parameters;

  if (!cvm_id || cvm_id.trim() === "") {
    return {
      success: false,
      error: {
        isRequestError: true,
        message: "CVM ID is required",
        status: 400,
      },
    } as SafeResult<CommitCvmComposeFileUpdateReturnType<T>>;
  }

  if (!request.compose_hash || request.compose_hash.trim() === "") {
    return {
      success: false,
      error: {
        isRequestError: true,
        message: "Compose hash is required",
        status: 400,
      },
    } as SafeResult<CommitCvmComposeFileUpdateReturnType<T>>;
  }

  const httpResult = await client.safePatch(`/cvms/${cvm_id}/compose_file`, request);

  if (!httpResult.success) {
    return httpResult as SafeResult<CommitCvmComposeFileUpdateReturnType<T>>;
  }

  if (options.schema === false) {
    return { success: true, data: httpResult.data } as SafeResult<
      CommitCvmComposeFileUpdateReturnType<T>
    >;
  }

  const schema = (options.schema || CommitCvmComposeFileUpdateSchema) as z.ZodSchema;
  return schema.safeParse(httpResult.data) as SafeResult<CommitCvmComposeFileUpdateReturnType<T>>;
}
