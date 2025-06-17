# Action Functions Development Guide

**Requirements**: Every action function MUST include unit tests AND e2e tests covering all branches, error scenarios, and type inference.

## Core Architecture

### Action Types
- **HTTP Actions**: API calls via HTTP client
- **Blockchain Actions**: Direct blockchain operations via viem
- **Hybrid Actions**: Combined HTTP + blockchain operations

### Required Patterns
1. **Dual API**: Standard (throws) + Safe (returns `SafeResult<T>`)
2. **Type-Safe Schemas**: Zod validation with TypeScript inference
3. **Conditional Types**: Smart return type inference based on parameters

## File Structure
```
src/actions/
├── {action_name}.ts           # Implementation
├── {action_name}.test.ts      # Unit tests (REQUIRED)
└── {action_name}.e2e.test.ts  # E2E tests (REQUIRED)
```

## Implementation Templates

### HTTP Action Template

```typescript
import { z } from "zod";
import { type Client, type SafeResult } from "../client";

/**
 * Brief action description
 * 
 * @example
 * ```typescript
 * import { createClient, myAction } from '@phala/cloud'
 * 
 * const client = createClient({ apiKey: 'your-key' })
 * const result = await myAction(client, { param: 'value' })
 * ```
 */

// Schema: align with backend, use .optional()/.nullable(), add .passthrough()
export const MyActionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
}).passthrough();

export type MyAction = z.infer<typeof MyActionSchema>;

// Conditional types for type inference
export type MyActionParameters<T = undefined> = {
  param: string;
} & (T extends z.ZodSchema ? { schema: T } : T extends false ? { schema: false } : { schema?: z.ZodSchema | false });

export type MyActionReturnType<T = undefined> = T extends z.ZodSchema
  ? z.infer<T> : T extends false ? unknown : MyAction;

// Standard version (throws)
export async function myAction<T extends z.ZodSchema | false | undefined = undefined>(
  client: Client,
  params: MyActionParameters<T>
): Promise<MyActionReturnType<T>> {
  const response = await client.post("/api/endpoint", params);
  
  if (params.schema === false) {
    return response as MyActionReturnType<T>;
  }
  
  const schema = (params.schema || MyActionSchema) as z.ZodSchema;
  return schema.parse(response) as MyActionReturnType<T>;
}

// Safe version (returns SafeResult)
export async function safeMyAction<T extends z.ZodSchema | false | undefined = undefined>(
  client: Client,
  params: MyActionParameters<T>
): Promise<SafeResult<MyActionReturnType<T>>> {
  const httpResult = await client.safePost("/api/endpoint", params);
  
  if (!httpResult.success) {
    return httpResult as SafeResult<MyActionReturnType<T>>;
  }
  
  if (params.schema === false) {
    return { success: true, data: httpResult.data } as SafeResult<MyActionReturnType<T>>;
  }
  
  const schema = (params.schema || MyActionSchema) as z.ZodSchema;
  return schema.safeParse(httpResult.data) as SafeResult<MyActionReturnType<T>>;
}
```

### Blockchain Action Template

```typescript
import { z } from "zod";
import { type Chain, type Address, type Hex, createPublicClient, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { type SafeResult } from "../client";
import { 
  type NetworkClients, validateNetworkPrerequisites, createTransactionTracker,
  executeTransactionWithRetry, type RetryOptions, type TransactionOptions 
} from "../utils";

// Schema with conditional validation
const BlockchainActionSchema = z.object({
  chain: z.unknown().optional(),
  contractAddress: z.string(),
  privateKey: z.string().optional(),
  walletClient: z.unknown().optional(),
  publicClient: z.unknown().optional(),
  timeout: z.number().optional().default(120000),
  retryOptions: z.unknown().optional(),
}).refine((data) => {
  // XOR: privateKey OR walletClient, not both
  return !!data.privateKey !== !!data.walletClient;
}, { message: "Provide either 'privateKey' or 'walletClient', not both" })
.refine((data) => {
  // Chain required when clients not provided
  return !!(data.publicClient && data.walletClient) || !!data.chain;
}, { message: "Chain required when publicClient or walletClient missing" });

export type BlockchainActionRequest = {
  chain?: Chain;
  contractAddress: Address;
  privateKey?: Hex;
  walletClient?: WalletClient;
  publicClient?: PublicClient;
  timeout?: number;
  retryOptions?: RetryOptions;
  onTransactionSubmitted?: (hash: Hash) => void;
  onTransactionConfirmed?: (receipt: TransactionReceipt) => void;
};

export async function blockchainAction(request: BlockchainActionRequest) {
  const validated = BlockchainActionSchema.parse(request);
  
  // Create clients
  let publicClient: PublicClient, walletClient: WalletClient, address: Address;
  
  if (validated.privateKey) {
    const account = privateKeyToAccount(validated.privateKey as Hex);
    publicClient = validated.publicClient as PublicClient || 
      createPublicClient({ chain: validated.chain as Chain, transport: http() });
    walletClient = createWalletClient({
      account, chain: validated.chain as Chain, transport: http()
    });
    address = account.address;
  } else {
    walletClient = validated.walletClient as WalletClient;
    publicClient = validated.publicClient as PublicClient ||
      createPublicClient({ chain: validated.chain as Chain, transport: http() });
    address = walletClient.account!.address;
  }
  
  const networkClients: NetworkClients = { publicClient, walletClient, address, chainId: (validated.chain as Chain).id };
  
  // Validate prerequisites
  await validateNetworkPrerequisites(networkClients, {
    targetChainId: networkClients.chainId,
    minBalance: parseEther("0.001")
  });
  
  // Execute transaction
  const operation = async (clients: NetworkClients) => {
    return await clients.walletClient.writeContract({
      address: validated.contractAddress as Address,
      abi: yourContractAbi,
      functionName: "yourFunction",
      args: [],
    });
  };
  
  const tracker = createTransactionTracker();
  const result = validated.retryOptions 
    ? await executeTransactionWithRetry(operation, networkClients, [], {
        timeout: validated.timeout!, confirmations: 1,
        onSubmitted: validated.onTransactionSubmitted,
        onConfirmed: validated.onTransactionConfirmed,
      }, validated.retryOptions)
    : await tracker.execute(operation, networkClients, [], {
        timeout: validated.timeout!, confirmations: 1,
        onSubmitted: validated.onTransactionSubmitted,
        onConfirmed: validated.onTransactionConfirmed,
      });
  
  return parseBlockchainResult(result.receipt);
}
```

## Testing Requirements

### Unit Tests (`{action}.test.ts`)
**Required Coverage:**
- Standard & safe versions (success/error paths)
- Schema validation (default/custom/false)
- Parameter handling (empty/missing)
- Type inference verification
- **SafeError type guards**: ALWAYS use `"isRequestError" in result.error` before accessing `.status`

```typescript
// ❌ WRONG: Causes TypeScript error
expect(result.error.status).toBe(404);

// ✅ CORRECT: Required type guard
if ("isRequestError" in result.error && result.error.isRequestError) {
  expect(result.error.status).toBe(404);
}
```

### E2E Tests (`{action}.e2e.test.ts`)
**Required Coverage:**
- Real API calls with dynamic parameters (fetch via other actions)
- All HTTP error codes 400-500 with intentionally invalid data
- Skip when env vars missing

```typescript
describe("E2E Error Scenarios", () => {
  test("400 Bad Request", async () => {
    const result = await safeMyAction(client, { invalid: "data" });
    expect(result.success).toBe(false);
    if ("isRequestError" in result.error) {
      expect(result.error.status).toBe(400);
    }
  });
});
```

## Parameter Evolution Guide

### Renaming Parameters: Mandatory Checklist

**Files to Update:**
- [ ] `{action}.ts`: Types, JSDoc, examples, error messages
- [ ] `{action}.test.ts`: All parameter usage, error expectations
- [ ] `{action}.e2e.test.ts`: All test scenarios, variable names

**Example Rename Process:**
```typescript
// Before
{ identifier: "cvm-123" }

// After  
{ cvm_id: "cvm-123" }

// Internal transformation for API compatibility
const apiParams = { identifier: params.cvm_id };
```

**Systematic Updates:**
```bash
# Find affected files
find . -name "*{action}*.test.ts"

# Update with sed
sed -i 's/identifier:/cvm_id:/g' *.test.ts

# Verify changes
npm test -- --grep "{action}"
```

## Schema Design Rules

### API Contract Verification
**CRITICAL**: Test real API before implementing schemas

```typescript
// ❌ Wrong: Assuming structure
encrypted_env: z.array(z.object({ key: z.string(), value: z.string() }))

// ✅ Correct: Verify API returns string
encrypted_env: z.string() // Backend expects hex string
```

### Schema Patterns
```typescript
// Required patterns
export const MySchema = z.object({
  required_field: z.string(),
  optional_field: z.string().optional(),
  nullable_field: z.string().nullable().optional(),
}).passthrough(); // Forward compatibility
```

## Common Patterns

### Path Parameters
```typescript
export async function getUser(client: Client, userId: string, params?: GetUserParams) {
  return client.get(`/users/${userId}`);
}
```

### Query Parameters  
```typescript
export type ListParams = { page?: number; limit?: number; };
```

### Body Parameters
```typescript
export type CreateParams = { body: { name: string; email: string; }; };
```

## Error Handling Best Practices

### Use safePost/safeGet for Consistent Types
```typescript
// ✅ Correct: Guaranteed RequestError type
const httpResult = await client.safePost("/endpoint", data);
if (!httpResult.success) {
  throw httpResult.error; // RequestError with isRequestError: true
}

// ❌ Wrong: Throws FetchError, not RequestError  
const response = await client.post("/endpoint", data);
```

### Debugging E2E Failures
```typescript
try {
  const result = await myAction(client, payload);
} catch (err: any) {
  console.log("📋 Payload:", JSON.stringify(payload, null, 2));
  console.log("⚠️ Error:", { status: err.status, detail: err.detail });
}
```

## Pre-Implementation Checklist

**Prevent Rework:**
- [ ] Parameter names user-friendly? (`cvm_id` not `identifier`)
- [ ] SafeError type guards planned?
- [ ] Test update scope identified?
- [ ] Real API contract verified?
- [ ] Error messages actionable?

**Red Flags:**
- Copying API parameter names directly
- Skipping real API testing
- Assuming data structures
- Missing SafeError type guards 