import { z } from "zod";
import { type Client, type SafeResult } from "../client";

/**
 * Provision CVM compose file update
 *
 * Provisions a CVM compose file update by uploading the new compose file configuration.
 * Returns a compose_hash that must be used with `commitCvmComposeFileUpdate` to finalize the update.
 *
 * @example
 * ```typescript
 * import { createClient, provisionCvmComposeFileUpdate } from '@phala/cloud'
 *
 * const client = createClient({ apiKey: 'your-api-key' })
 * const result = await provisionCvmComposeFileUpdate(client, {
 *   cvm_id: 'cvm-123',
 *   request: {
 *     docker_compose_file: 'version: "3.8"\nservices:\n  app:\n    image: nginx'
 *   }
 * })
 * console.log(`Compose hash: ${result.compose_hash}`)
 * ```
 *
 * ## Returns
 *
 * `ProvisionCvmComposeFileUpdateResult | unknown`
 *
 * Provision response including compose_hash and metadata needed for committing the update. Return type depends on schema parameter.
 *
 * ## Parameters
 *
 * ### cvm_id (required)
 *
 * - **Type:** `string`
 *
 * The CVM ID to update compose file for. Can be either an app_id or vm_uuid.
 *
 * ### request (required)
 *
 * - **Type:** `ProvisionCvmComposeFileUpdateRequest`
 *
 * The compose file update request containing compose_content and optional metadata.
 *
 * ### schema (optional)
 *
 * - **Type:** `ZodSchema | false`
 * - **Default:** `ProvisionCvmComposeFileUpdateResultSchema`
 *
 * Schema to validate the response. Use `false` to return raw data without validation.
 *
 * ```typescript
 * // Use default schema
 * const result = await provisionCvmComposeFileUpdate(client, { cvm_id: 'cvm-123', request: composeRequest })
 *
 * // Return raw data without validation
 * const raw = await provisionCvmComposeFileUpdate(client, { cvm_id: 'cvm-123', request: composeRequest, schema: false })
 *
 * // Use custom schema
 * const customSchema = z.object({ compose_hash: z.string() })
 * const custom = await provisionCvmComposeFileUpdate(client, { cvm_id: 'cvm-123', request: composeRequest, schema: customSchema })
 * ```
 *
 * ## Safe Version
 *
 * Use `safeProvisionCvmComposeFileUpdate` for error handling without exceptions:
 *
 * ```typescript
 * import { safeProvisionCvmComposeFileUpdate } from '@phala/cloud'
 *
 * const result = await safeProvisionCvmComposeFileUpdate(client, { cvm_id: 'cvm-123', request: composeRequest })
 * if (result.success) {
 *   console.log(`Compose hash: ${result.data.compose_hash}`)
 * } else {
 *   if ("isRequestError" in result.error) {
 *     console.error(`HTTP ${result.error.status}: ${result.error.message}`)
 *   } else {
 *     console.error(`Validation error: ${result.error.issues}`)
 *   }
 * }
 * ```
 */

export const ProvisionCvmComposeFileUpdateRequestSchema = z
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

export const ProvisionCvmComposeFileUpdateResultSchema = z
  .object({
    app_id: z.string().nullable().optional(),
    device_id: z.string().nullable().optional(),
    compose_hash: z.string(),
    kms_info: z
      .object({
        chain_id: z.number(),
        kms_url: z.string(),
        kms_contract_address: z.string(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

// Legacy aliases for backwards compatibility
export const ProvisionCvmComposeFileUpdateSchema = ProvisionCvmComposeFileUpdateResultSchema;
export type ProvisionCvmComposeFileUpdate = z.infer<typeof ProvisionCvmComposeFileUpdateSchema>;
export type ProvisionCvmComposeFileUpdateRequest = z.infer<
  typeof ProvisionCvmComposeFileUpdateRequestSchema
>;
export type ProvisionCvmComposeFileUpdateResult = z.infer<
  typeof ProvisionCvmComposeFileUpdateResultSchema
>;

export type ProvisionCvmComposeFileUpdateParameters<T = undefined> = {
  cvm_id: string;
  request: ProvisionCvmComposeFileUpdateRequest;
} & (T extends z.ZodSchema
  ? { schema: T }
  : T extends false
    ? { schema: false }
    : { schema?: z.ZodSchema | false });

export type ProvisionCvmComposeFileUpdateReturnType<T = undefined> = T extends z.ZodSchema
  ? z.infer<T>
  : T extends false
    ? unknown
    : ProvisionCvmComposeFileUpdateResult;

export async function provisionCvmComposeFileUpdate<
  T extends z.ZodSchema | false | undefined = undefined,
>(
  client: Client,
  parameters: ProvisionCvmComposeFileUpdateParameters<T>,
): Promise<ProvisionCvmComposeFileUpdateReturnType<T>> {
  const { cvm_id, request, ...options } = parameters;

  if (!cvm_id || cvm_id.trim() === "") {
    throw new Error("CVM ID is required");
  }

  if (!request.docker_compose_file || request.docker_compose_file.trim() === "") {
    throw new Error("Docker compose file is required");
  }

  // Transform cvm_id to identifier for API call
  const result = await client.safePost(`/cvms/${cvm_id}/compose_file/provision`, request);
  if (!result.success) {
    throw result.error;
  }

  if (options.schema === false) {
    return result.data as ProvisionCvmComposeFileUpdateReturnType<T>;
  }

  const schema = (options.schema || ProvisionCvmComposeFileUpdateResultSchema) as z.ZodSchema;
  return schema.parse(result.data) as ProvisionCvmComposeFileUpdateReturnType<T>;
}

export async function safeProvisionCvmComposeFileUpdate<
  T extends z.ZodSchema | false | undefined = undefined,
>(
  client: Client,
  parameters: ProvisionCvmComposeFileUpdateParameters<T>,
): Promise<SafeResult<ProvisionCvmComposeFileUpdateReturnType<T>>> {
  const { cvm_id, request, ...options } = parameters;

  if (!cvm_id || cvm_id.trim() === "") {
    return {
      success: false,
      error: {
        isRequestError: true,
        message: "CVM ID is required",
        status: 400,
      },
    } as SafeResult<ProvisionCvmComposeFileUpdateReturnType<T>>;
  }

  if (!request.docker_compose_file || request.docker_compose_file.trim() === "") {
    return {
      success: false,
      error: {
        isRequestError: true,
        message: "Docker compose file is required",
        status: 400,
      },
    } as SafeResult<ProvisionCvmComposeFileUpdateReturnType<T>>;
  }

  // Transform cvm_id to identifier for API call
  const httpResult = await client.safePost(`/cvms/${cvm_id}/compose_file/provision`, request);

  if (!httpResult.success) {
    return httpResult as SafeResult<ProvisionCvmComposeFileUpdateReturnType<T>>;
  }

  if (options.schema === false) {
    return { success: true, data: httpResult.data } as SafeResult<
      ProvisionCvmComposeFileUpdateReturnType<T>
    >;
  }

  const schema = (options.schema || ProvisionCvmComposeFileUpdateResultSchema) as z.ZodSchema;
  return schema.safeParse(httpResult.data) as SafeResult<
    ProvisionCvmComposeFileUpdateReturnType<T>
  >;
}
