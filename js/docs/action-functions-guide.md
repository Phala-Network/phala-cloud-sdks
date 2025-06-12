# Action Functions Development Guide

A comprehensive guide for creating consistent, type-safe, and well-tested action functions in the Phala Cloud SDK.

## Overview

**Every action function implementation MUST include both unit tests and end-to-end (e2e) tests.** These tests must cover all major branches, error branches, and type inference scenarios. This ensures not only the correctness of the action itself, but also the robustness of error handling and forward compatibility. All new actions will not be considered complete unless both unit and e2e tests are provided and pass.

Action functions are the primary interface for SDK users to interact with the Phala Cloud API. They provide a clean, typed abstraction over HTTP requests with built-in validation, error handling, and comprehensive testing.

## Core Principles

### Dual API Pattern
Every action should provide two versions:
- **Standard version**: Throws errors for traditional try/catch handling
- **Safe version**: Returns `SafeResult<T>` for functional error handling

### Type-Safe Schema Validation
- Use Zod schemas for runtime validation with TypeScript inference.
- Always align Zod schemas with backend (Python/Pydantic) models.
- For optional fields, use `.optional()` or `.nullable().optional()` as appropriate.
- Top-level schemas must use `.passthrough()` for forward compatibility.

### Intelligent Type Inference
- Use TypeScript conditional types to provide smart return type inference based on parameters.
- Type inference tests should use type-level assertions, not generic invocation.

## File Structure

```
src/actions/
├── index.ts                    # Export all actions
├── {action_name}.ts           # Action implementation
├── {action_name}.test.ts      # Unit tests (REQUIRED)
└── {action_name}.e2e.test.ts   # End-to-end (integration) tests (REQUIRED)
```

## Implementation Template

### 1. Basic Structure

```typescript
import { z } from "zod";
import { type Client, type SafeResult } from "../client";

/**
 * {Action description}
 *
 * {Detailed description of what this action does}
 *
 * @example
 * ```typescript
 * import { createClient, {actionName} } from '@phala/cloud'
 *
 * // Using environment variables (PHALA_CLOUD_API_KEY)
 * const client = createClient()
 * // Or explicit configuration
 * const client = createClient({ apiKey: 'your-api-key' })
 * 
 * const result = await {actionName}(client)
 * // Output: { ... }
 * ```
 *
 * ## Returns
 *
 * `{ReturnType} | unknown`
 *
 * {Description of return value}. Return type depends on schema parameter.
 *
 * ## Parameters
 *
 * ### schema (optional)
 *
 * - **Type:** `ZodSchema | false`
 * - **Default:** `{ActionName}Schema`
 *
 * Schema to validate the response. Use `false` to return raw data without validation.
 *
 * ```typescript
 * // Use default schema
 * const result = await {actionName}(client)
 *
 * // Return raw data without validation
 * const raw = await {actionName}(client, { schema: false })
 *
 * // Use custom schema
 * const customSchema = z.object({ id: z.number(), name: z.string() })
 * const custom = await {actionName}(client, { schema: customSchema })
 * ```
 *
 * ## Safe Version
 *
 * Use `safe{ActionName}` for error handling without exceptions:
 *
 * ```typescript
 * import { safe{ActionName} } from '@phala/cloud'
 *
 * const result = await safe{ActionName}(client)
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

// Zod schema definition (align with backend, use .optional()/.nullable() for optional fields)
export const {ActionName}Schema = z
  .object({
    // Define schema fields
  })
  .passthrough();

export type {ActionName} = z.infer<typeof {ActionName}Schema>;

// Conditional types for intelligent type inference
export type {ActionName}Parameters<T = undefined> = T extends z.ZodSchema
  ? { schema: T }
  : T extends false
    ? { schema: false }
    : { schema?: z.ZodSchema | false };

export type {ActionName}ReturnType<T = undefined> = T extends z.ZodSchema
  ? z.infer<T>
  : T extends false
    ? unknown
    : {ActionName};

// Standard version (throws on error)
export async function {actionName}<T extends z.ZodSchema | false | undefined = undefined>(
  client: Client,
  parameters?: {ActionName}Parameters<T>,
): Promise<{ActionName}ReturnType<T>> {
  const response = await client.get("{api_endpoint}");

  if (parameters?.schema === false) {
    return response as {ActionName}ReturnType<T>;
  }

  const schema = (parameters?.schema || {ActionName}Schema) as z.ZodSchema;
  return schema.parse(response) as {ActionName}ReturnType<T>;
}

// Safe version (returns SafeResult)
export async function safe{ActionName}<T extends z.ZodSchema | false | undefined = undefined>(
  client: Client,
  parameters?: {ActionName}Parameters<T>,
): Promise<SafeResult<{ActionName}ReturnType<T>>> {
  const httpResult = await client.safeGet("{api_endpoint}");

  if (!httpResult.success) {
    return httpResult as SafeResult<{ActionName}ReturnType<T>>;
  }

  if (parameters?.schema === false) {
    return { success: true, data: httpResult.data } as SafeResult<{ActionName}ReturnType<T>>;
  }

  const schema = (parameters?.schema || {ActionName}Schema) as z.ZodSchema;
  return schema.safeParse(httpResult.data) as SafeResult<{ActionName}ReturnType<T>>;
}
```

### 2. Schema Design

- **Align with backend:** Always match the backend (Python/Pydantic) model fields and types.
- **Optional fields:** Use `.optional()` or `.nullable().optional()` for any field that is not always present.
- **Forward compatibility:** Always add `.passthrough()` to the top-level schema. Add tests to ensure extra fields in the API response do not cause validation failures.

#### API Contract Verification

**Critical**: Always verify the actual API contract before implementing schemas. A common pitfall is assuming data structures without testing.

```typescript
// ⚠️ Example: Don't assume complex structures
// Documentation might show: "encrypted_env": "hex-encoded-string"
// But implementer might assume:
encrypted_env: z.array(z.object({ key: z.string(), value: z.string() })) // ❌ Wrong!

// ✅ Always verify with actual API testing first:
encrypted_env: z.string() // Correct - backend expects hex string
```

**Schema Design Checklist:**
- [ ] Check API documentation examples for actual JSON payloads
- [ ] Test minimal payload with real API to understand expected format  
- [ ] Pay attention to error messages (e.g., `"Input should be a valid string"` = type mismatch)
- [ ] Cross-reference with similar endpoints for consistency
- [ ] Document reasoning with comments in schema definitions

**Common Error Patterns:**
| Backend Error | Likely Cause | Solution |
|---------------|--------------|----------|
| `"Input should be a valid string"` | Field expects string, got array/object | Change to `z.string()` |
| `"Field required"` | Missing required field | Add field or make optional |
| `"non-hexadecimal number found in fromhex()"` | Invalid hex format | Use valid hex data |

### 3. Type Inference

- Use TypeScript conditional types for parameterized return types.
- In tests, use type-level assertions for type inference:

```typescript
type T = Awaited<ReturnType<typeof getXxx>>;
const isExpected: T extends ExpectedType ? true : false = true;
expect(isExpected).toBe(true);
```

## Testing Structure

**Every action function MUST have both a unit test and an e2e test.**

### Unit Tests (`{action_name}.test.ts`)

- **Standard version:**
  - Returns data successfully
  - Validates response data with Zod schema
  - Handles API errors (throws)
  - Returns raw data when schema is false
  - Uses custom schema when provided
  - Throws when custom schema validation fails
- **Safe version:**
  - Returns success result when API call succeeds
  - Returns error result when API call fails
  - Handles Zod validation errors
  - Passes through HTTP errors directly
  - Returns raw data when schema is false
  - Uses custom schema when provided
  - Returns validation error when custom schema fails
- **Parameter handling:**
  - Works without parameters (if allowed)
  - Works with empty parameters object (if allowed)
  - Works with safe version without parameters (if allowed)
  - Works with safe version with empty parameters object (if allowed)
- **Schema flexibility:**
  - Allows extra fields in API response for forward compatibility
- **Type inference:**
  - Infers correct types for default, unknown, and custom schema
- **Safe version type inference:**
  - Infers correct SafeResult types for all parameterizations

#### SafeResult Error Type Branching in Tests
When testing safe action functions, the `error` field in the result can be either an HTTP error (RequestError) or a Zod validation error (ZodError). **Always use `"isRequestError" in result.error` to distinguish the type before accessing properties.**

### End-to-End Tests (`{action_name}.e2e.test.ts`)

- **E2E tests must dynamically fetch available parameters (such as teepod_id, image, etc.) using other actions (e.g., getAvailableNodes) instead of hardcoding values.**
- Should call the real API and assert the main fields are present.
- Should skip if required environment variables (e.g., API key) are not set.
- **E2E tests must include error scenarios for all status codes in the range >= 400 and <= 500 (client and server errors). This includes, but is not limited to, 400/401/403/404/422/429/500. You must intentionally pass invalid parameters and assert that the SDK returns/throws the correct error type, status, and detail.**
- Should output or assert error.detail and error.status for HTTP errors, and error.issues for validation errors.

#### E2E Test Data Quality

**Critical**: Use realistic test data that mirrors actual API usage. Poor test data can mask real integration issues.

```typescript
// ❌ Poor E2E test data that will fail backend parsing
const badPayload = {
  encrypted_env: "mock_non_hex_string", // Invalid format
  app_id: "test-app-id"                 // Too short
};

// ✅ Quality E2E test data using valid formats
const goodPayload = {
  encrypted_env: "deadbeef1234567890abcdef1234567890abcdef", // Valid hex
  app_id: "1234567890abcdef1234567890abcdef12345678"        // Correct length
};
```

#### Debugging E2E Failures

When E2E tests fail with HTTP errors, add debug logging to understand the issue:

```typescript
try {
  const result = await myAction(client, payload);
} catch (err: any) {
  // Debug the actual request/response
  console.log("📋 Request payload:", JSON.stringify(payload, null, 2));
  console.log("⚠️ Error details:", JSON.stringify(err, null, 2));
  
  // Check key indicators:
  // - err.status: HTTP status code
  // - err.detail: Backend validation messages  
  // - err.message: General error description
}
```

### Test Coverage Checklist
For every action function, unit and e2e tests must cover:
- Standard schema validation
- API errors (exception thrown)
- SafeResult success and failure branches
- Zod validation errors
- HTTP error passthrough
- Parameter handling (no parameters, empty object, custom schema, schema: false)
- Forward compatibility (extra fields in response)
- Type inference (default, unknown, custom schema)
- **E2E: error scenarios for all status codes >= 400 and <= 500 must be tested (client and server errors)**

## Best Practices

- Use conditional types for intelligent type inference.
- Prefer single-line function signatures when possible.
- Keep parameter names consistent (`parameters` not `options`).
- Use descriptive variable names.
- Always support both error patterns (throw vs SafeResult).
- Use discriminated unions for error type detection in tests.
- Provide meaningful error messages.
- Export all relevant types for consumer use.
- Aim for 100% code coverage.
- Mock external dependencies properly.
- Include edge cases and boundary conditions.
- Consider schema validation performance for large responses.
- **API Contract First**: Always test real API endpoints before implementing schemas to avoid type mismatches.
- **Quality Test Data**: Use realistic, valid test data that mirrors production API usage.
- **Document Schema Decisions**: Add comments explaining non-obvious schema choices based on API testing.
- **Error Message Analysis**: Learn to quickly identify backend validation errors for efficient debugging.

## Common Patterns

### With Body Parameters
For POST/PUT operations that require request bodies:

```typescript
export type CreateUserParameters<T = undefined> = {
  body: {
    name: string;
    email: string;
  };
} & (T extends z.ZodSchema
  ? { schema: T }
  : T extends false
    ? { schema: false }
    : { schema?: z.ZodSchema | false });
```

### With Query Parameters
For operations that accept query parameters:

```typescript
export type ListUsersParameters<T = undefined> = {
  page?: number;
  limit?: number;
} & (T extends z.ZodSchema
  ? { schema: T }
  : T extends false
    ? { schema: false }
    : { schema?: z.ZodSchema | false });
```

### With Path Parameters
For operations with dynamic path segments:

```typescript
export async function getUser<T extends z.ZodSchema | false | undefined = undefined>(
  client: Client,
  userId: string,
  parameters?: GetUserParameters<T>,
): Promise<GetUserReturnType<T>> {
  const response = await client.get(`/users/${userId}`);
  // ... rest of implementation
}
```

## Advanced Patterns

### Compatibility and Field Migration

When API fields need to be renamed or deprecated, implement compatibility layers to ensure smooth migration:

#### Input Parameter Compatibility
```typescript
// Support both old and new field names in request
export type MyActionRequest = {
  new_field?: string;     // recommended
  old_field?: string;     // deprecated, for compatibility
};

// Compatibility handler function
function handleFieldCompatibility(input: MyActionRequest): MyActionRequest {
  if (!input.old_field && !input.new_field) {
    return input;
  }
  
  const result = { ...input };
  
  // If both provided, prefer new field
  if (typeof result.new_field === "string" && typeof result.old_field === "string") {
    delete result.old_field;
  }
  // If only old field provided, convert and warn
  else if (typeof result.old_field === "string" && typeof result.new_field === "undefined") {
    result.new_field = result.old_field;
    delete result.old_field;
    console.warn("[sdk] old_field is deprecated, please use new_field instead.");
  }
  
  return result;
}
```

#### Response Field Transformation
```typescript
// Transform backend response fields for better user experience
function transformResponse(data: any, isDefaultSchema: boolean): any {
  if (!isDefaultSchema || !data || typeof data !== "object") {
    return data;
  }
  
  // Transform backend field names to user-friendly names
  if ("backend_field_name" in data) {
    const { backend_field_name, ...rest } = data;
    return { ...rest, user_friendly_name: backend_field_name };
  }
  
  return data;
}
```

### Parameter Preprocessing

For complex actions that need parameter validation or transformation:

```typescript
// Auto-fill missing required fields
function autofillDefaults(params: MyActionParams): MyActionParams {
  if (params.config && !params.config.name) {
    return {
      ...params,
      config: {
        ...params.config,
        name: params.defaultName || "auto-generated",
      },
    };
  }
  return params;
}

// Chain multiple preprocessing functions
export async function myAction<T extends z.ZodSchema | false | undefined = undefined>(
  client: Client,
  params: MyActionParams,
  options?: MyActionOptions<T>,
): Promise<MyActionReturnType<T>> {
  // Apply preprocessing in order
  const processedParams = handleFieldCompatibility(
    autofillDefaults(params)
  );
  
  // Continue with API call...
}
```

### Error Handling Best Practices

#### Use safePost/safeGet for Consistent Error Types

Always use the `safe*` methods in action implementations to ensure consistent error handling:

```typescript
// ✅ Correct: Use safePost for consistent RequestError type
export async function myAction<T extends z.ZodSchema | false | undefined = undefined>(
  client: Client,
  data: MyActionData,
  parameters?: MyActionParameters<T>,
): Promise<MyActionReturnType<T>> {
  const httpResult = await client.safePost("/api/endpoint", data);
  
  if (!httpResult.success) {
    throw httpResult.error; // This is guaranteed to be RequestError with isRequestError: true
  }
  
  // Continue with response processing...
}

// ❌ Incorrect: Using post directly throws FetchError, not RequestError
export async function myAction(client: Client, data: MyActionData) {
  const response = await client.post("/api/endpoint", data); // Throws FetchError
  return response;
}
```