import { z } from "zod";
import { type Client, type SafeResult } from "../client";

/**
 * Commit CVM Provision (Create CVM from provisioned data)
 *
 * This action creates a CVM using previously provisioned data and encrypted environment variables.
 * It should be called after `provisionCvm` to complete the CVM deployment process.
 *
 * @example
 * ```typescript
 * import { createClient, provisionCvm, commitCvmProvision } from '@phala/cloud'
 *
 * const client = createClient();
 *
 * // First, provision the CVM
 * const provision = await provisionCvm(client, appCompose);
 *
 * // Then, commit the provision with encrypted environment variables
 * const cvm = await commitCvmProvision(client, {
 *   encrypted_env: "hex-encoded-encrypted-environment-data", // String, not array
 *   app_id: provision.app_id,
 *   compose_hash: provision.compose_hash,
 *   kms_id: "your-kms-id",
 *   contract_address: "0x123...",
 *   deployer_address: "0x456..."
 * });
 *
 * console.log(cvm.id);
 * ```
 *
 * ## Returns
 *
 * `CommitCvmProvision | unknown`
 *
 * The created CVM details including id, name, status, and other metadata. Return type depends on schema parameter.
 *
 * ## Parameters
 *
 * ### schema (optional)
 *
 * - **Type:** `ZodSchema | false`
 * - **Default:** `CommitCvmProvisionSchema`
 *
 * Schema to validate the response. Use `false` to return raw data without validation.
 *
 * ```typescript
 * // Use default schema
 * const result = await commitCvmProvision(client, payload)
 *
 * // Return raw data without validation
 * const raw = await commitCvmProvision(client, payload, { schema: false })
 *
 * // Use custom schema
 * const customSchema = z.object({ id: z.number(), name: z.string() })
 * const custom = await commitCvmProvision(client, payload, { schema: customSchema })
 * ```
 *
 * ## Safe Version
 *
 * Use `safeCommitCvmProvision` for error handling without exceptions:
 *
 * ```typescript
 * import { safeCommitCvmProvision } from '@phala/cloud'
 *
 * const result = await safeCommitCvmProvision(client, payload)
 * if (result.success) {
 *   console.log(result.data)
 * } else {
 *   if ("isRequestError" in result.error) {
 *     console.error(`HTTP ${result.error.status}: ${result.error.message}`)
 *   } else {
 *     console.error(`Validation error: ${result.error.issues}`)
 *   }
 * }
 * ```
 */

// Zod schema definition (align with backend VMSchema)
export const CommitCvmProvisionSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    status: z.string(),
    teepod_id: z.number(),
    teepod: z
      .object({
        id: z.number(),
        name: z.string(),
      })
      .nullable(),
    user_id: z.number().nullable(),
    app_id: z.string().nullable(),
    vm_uuid: z.string().nullable(),
    instance_id: z.string().nullable(),
    app_url: z.string().nullable(),
    base_image: z.string().nullable(),
    vcpu: z.number(),
    memory: z.number(),
    disk_size: z.number(),
    manifest_version: z.number().nullable(),
    version: z.string().nullable(),
    runner: z.string().nullable(),
    docker_compose_file: z.string().nullable(),
    features: z.array(z.string()).nullable(),
    created_at: z.string(),
    encrypted_env_pubkey: z.string().nullable().optional(),
    app_auth_contract_address: z.string().nullable().optional(),
    deployer_address: z.string().nullable().optional(),
  })
  .passthrough();

export type CommitCvmProvision = z.infer<typeof CommitCvmProvisionSchema>;

// Request schema
export const CommitCvmProvisionRequestSchema = z
  .object({
    encrypted_env: z.string(),
    app_id: z.string(),
    compose_hash: z.string().optional(),
    kms_id: z.string().optional(),
    contract_address: z.string().optional(),
    deployer_address: z.string().optional(),
  })
  .passthrough();

export type CommitCvmProvisionRequest = z.infer<typeof CommitCvmProvisionRequestSchema>;

// Conditional types for intelligent type inference
export type CommitCvmProvisionParameters<T = undefined> = T extends z.ZodSchema
  ? { schema: T }
  : T extends false
    ? { schema: false }
    : { schema?: z.ZodSchema | false };

export type CommitCvmProvisionReturnType<T = undefined> = T extends z.ZodSchema
  ? z.infer<T>
  : T extends false
    ? unknown
    : CommitCvmProvision;

// Standard version (throws on error)
export async function commitCvmProvision<T extends z.ZodSchema | false | undefined = undefined>(
  client: Client,
  payload: CommitCvmProvisionRequest,
  parameters?: CommitCvmProvisionParameters<T>,
): Promise<CommitCvmProvisionReturnType<T>> {
  // Use safePost for proper error handling to ensure RequestError type
  const httpResult = await client.safePost("/cvms", payload);

  if (!httpResult.success) {
    throw httpResult.error;
  }

  if (parameters?.schema === false) {
    return httpResult.data as CommitCvmProvisionReturnType<T>;
  }

  const schema = (parameters?.schema || CommitCvmProvisionSchema) as z.ZodSchema;
  return schema.parse(httpResult.data) as CommitCvmProvisionReturnType<T>;
}

// Safe version (returns SafeResult)
export async function safeCommitCvmProvision<T extends z.ZodSchema | false | undefined = undefined>(
  client: Client,
  payload: CommitCvmProvisionRequest,
  parameters?: CommitCvmProvisionParameters<T>,
): Promise<SafeResult<CommitCvmProvisionReturnType<T>>> {
  const httpResult = await client.safePost("/cvms", payload);

  if (!httpResult.success) {
    return httpResult as SafeResult<CommitCvmProvisionReturnType<T>>;
  }

  if (parameters?.schema === false) {
    return { success: true, data: httpResult.data } as SafeResult<CommitCvmProvisionReturnType<T>>;
  }

  const schema = (parameters?.schema || CommitCvmProvisionSchema) as z.ZodSchema;
  const validationResult = schema.safeParse(httpResult.data);
  return validationResult as SafeResult<CommitCvmProvisionReturnType<T>>;
}
