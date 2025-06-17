import { z } from "zod";
import { type Client, type SafeResult } from "../client";

/**
 * Get CVM compose file configuration
 *
 * Retrieves the current Docker Compose file configuration and metadata for a specified CVM.
 *
 * @example
 * ```typescript
 * import { createClient, getCvmComposeFile } from '@phala/cloud'
 *
 * const client = createClient({ apiKey: 'your-api-key' })
 * const composeFile = await getCvmComposeFile(client, { cvm_id: 'cvm-123' })
 * // Output: { compose_content: '...', version: '...', last_modified: '...' }
 * ```
 *
 * ## Returns
 *
 * `GetCvmComposeFileResult | unknown`
 *
 * The CVM compose file configuration including compose_content and metadata. Return type depends on schema parameter.
 *
 * ## Parameters
 *
 * ### cvm_id (required)
 *
 * - **Type:** `string`
 *
 * The CVM ID to retrieve compose file for. Can be either an app_id or vm_uuid.
 *
 * ### schema (optional)
 *
 * - **Type:** `ZodSchema | false`
 * - **Default:** `GetCvmComposeFileResultSchema`
 *
 * Schema to validate the response. Use `false` to return raw data without validation.
 *
 * ```typescript
 * // Use default schema
 * const result = await getCvmComposeFile(client, { cvm_id: 'cvm-123' })
 *
 * // Return raw data without validation
 * const raw = await getCvmComposeFile(client, { cvm_id: 'cvm-123', schema: false })
 *
 * // Use custom schema
 * const customSchema = z.object({ compose_content: z.string() })
 * const custom = await getCvmComposeFile(client, { cvm_id: 'cvm-123', schema: customSchema })
 * ```
 *
 * ## Safe Version
 *
 * Use `safeGetCvmComposeFile` for error handling without exceptions:
 *
 * ```typescript
 * import { safeGetCvmComposeFile } from '@phala/cloud'
 *
 * const result = await safeGetCvmComposeFile(client, { cvm_id: 'cvm-123' })
 * if (result.success) {
 *   console.log(result.data.compose_content)
 * } else {
 *   if ("isRequestError" in result.error) {
 *     console.error(`HTTP ${result.error.status}: ${result.error.message}`)
 *   } else {
 *     console.error(`Validation error: ${result.error.issues}`)
 *   }
 * }
 * ```
 */

export const GetCvmComposeFileResultSchema = z
  .object({
    allowed_envs: z.array(z.string()).optional(),
    docker_compose_file: z.string(),
    features: z.array(z.string()).optional(),
    name: z.string().optional(),
    manifest_version: z.number().optional(),
    kms_enabled: z.boolean().optional(),
    public_logs: z.boolean().optional(),
    public_sysinfo: z.boolean().optional(),
    tproxy_enabled: z.boolean().optional(),
    pre_launch_script: z.string().optional(),
    docker_config: z
      .object({
        url: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

// Legacy alias for backwards compatibility
export const CvmComposeFileSchema = GetCvmComposeFileResultSchema;
export type CvmComposeFile = z.infer<typeof CvmComposeFileSchema>;
export type GetCvmComposeFileResult = z.infer<typeof GetCvmComposeFileResultSchema>;

export type GetCvmComposeFileParameters<T = undefined> = {
  cvm_id: string;
} & (T extends z.ZodSchema
  ? { schema: T }
  : T extends false
    ? { schema: false }
    : { schema?: z.ZodSchema | false });

export type GetCvmComposeFileReturnType<T = undefined> = T extends z.ZodSchema
  ? z.infer<T>
  : T extends false
    ? unknown
    : GetCvmComposeFileResult;

export async function getCvmComposeFile<T extends z.ZodSchema | false | undefined = undefined>(
  client: Client,
  parameters: GetCvmComposeFileParameters<T>,
): Promise<GetCvmComposeFileReturnType<T>> {
  const { cvm_id, ...options } = parameters;

  if (!cvm_id || cvm_id.trim() === "") {
    throw new Error("CVM ID is required");
  }

  // Transform cvm_id to identifier for API call
  const result = await client.safeGet(`/cvms/${cvm_id}/compose_file`);

  if (!result.success) {
    throw result.error;
  }

  if (options.schema === false) {
    return result.data as GetCvmComposeFileReturnType<T>;
  }

  const schema = (options.schema || GetCvmComposeFileResultSchema) as z.ZodSchema;
  return schema.parse(result.data) as GetCvmComposeFileReturnType<T>;
}

export async function safeGetCvmComposeFile<T extends z.ZodSchema | false | undefined = undefined>(
  client: Client,
  parameters: GetCvmComposeFileParameters<T>,
): Promise<SafeResult<GetCvmComposeFileReturnType<T>>> {
  const { cvm_id, ...options } = parameters;

  if (!cvm_id || cvm_id.trim() === "") {
    return {
      success: false,
      error: {
        isRequestError: true,
        message: "CVM ID is required",
        status: 400,
      },
    } as SafeResult<GetCvmComposeFileReturnType<T>>;
  }

  // Transform cvm_id to identifier for API call
  const httpResult = await client.safeGet(`/cvms/${cvm_id}/compose_file`);

  if (!httpResult.success) {
    return httpResult as SafeResult<GetCvmComposeFileReturnType<T>>;
  }

  if (options.schema === false) {
    return { success: true, data: httpResult.data } as SafeResult<GetCvmComposeFileReturnType<T>>;
  }

  const schema = (options.schema || GetCvmComposeFileResultSchema) as z.ZodSchema;
  return schema.safeParse(httpResult.data) as SafeResult<GetCvmComposeFileReturnType<T>>;
}
