import { z } from "zod";
import {
  type Chain,
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { type SafeResult } from "../client";
import {
  asHex,
  type NetworkClients,
  validateNetworkPrerequisites,
  type TransactionTracker,
  createTransactionTracker,
  type RetryOptions,
  executeTransactionWithRetry,
  type TransactionOptions,
} from "../utils";

/**
 * Add a compose hash to an App Auth contract through KMS lookup.
 *
 * This function adds a compose hash to an existing App Auth contract by:
 * 1. Looking up the App Auth contract address from the KMS contract using the app ID
 * 2. Calling the addComposeHash function on the App Auth contract
 * 3. Handling the transaction lifecycle with progress callbacks and retry mechanisms
 *
 * @group Actions
 * @since 0.1.0
 *
 * ## Usage
 *
 * ```typescript
 * import { addComposeHash, getComposeHash } from '@phala/cloud'
 * import { base } from 'viem/chains'
 *
 * // Calculate compose hash from your app compose configuration
 * const appCompose = { services: { myapp: { image: "my-updated-image" } } }
 * const composeHash = getComposeHash(appCompose)
 *
 * // Mode 1: Using private key (simple)
 * const result = await addComposeHash({
 *   chain: base,
 *   kmsContractAddress: "0x1234567890abcdef1234567890abcdef12345678",
 *   appId: "0xabcdef1234567890abcdef1234567890abcdef12",
 *   privateKey: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
 *   composeHash: composeHash,
 *   minBalance: "0.01" // Minimum ETH balance required
 * })
 *
 * // Mode 2: Using custom wallet client
 * const result2 = await addComposeHash({
 *   chain: base,
 *   kmsContractAddress: "0x1234567890abcdef1234567890abcdef12345678",
 *   appId: "0xabcdef1234567890abcdef1234567890abcdef12",
 *   walletClient: myWallet,
 *   composeHash: composeHash,
 *   onTransactionSubmitted: (hash) => console.log('Transaction submitted:', hash),
 * })
 *
 * // Mode 3: Full custom with retry options
 * const result3 = await addComposeHash({
 *   kmsContractAddress: "0x1234567890abcdef1234567890abcdef12345678",
 *   appId: "0xabcdef1234567890abcdef1234567890abcdef12",
 *   walletClient: myCustomWallet,
 *   publicClient: myCustomPublicClient,
 *   composeHash: composeHash,
 *   retryOptions: { maxRetries: 3, initialDelay: 1000 },
 *   timeout: 120000
 * })
 *
 * console.log(`Compose hash added: ${result.composeHash}`)
 * console.log(`Transaction hash: ${result.transactionHash}`)
 * // Output: { composeHash: "0x...", appAuthAddress: "0x...", transactionHash: "0x..." }
 * ```
 *
 * ## Returns
 *
 * `AddComposeHash | unknown`
 *
 * Information about the added compose hash including the compose hash value,
 * App Auth contract address, and transaction hash. Return type depends on schema parameter.
 *
 * ## Parameters
 *
 * ### request (required)
 *
 * - **Type:** `AddComposeHashRequest`
 *
 * Configuration object for adding a compose hash. Contains the following fields:
 *
 * #### chain (conditionally required)
 * - **Type:** `Chain` - Viem chain configuration object
 * - **Description:** Blockchain network configuration. Required when creating publicClient or walletClient. Optional when both publicClient and walletClient are provided.
 * - **Usage:** Used to create missing clients (publicClient or walletClient) when not provided
 * - **Example:** `import { base } from 'viem/chains'`
 *
 * #### kmsContractAddress (required)
 * - **Type:** `Address` - Ethereum contract address
 * - **Description:** Address of the KMS contract to lookup the App Auth contract
 * - **Example:** `"0x1234567890abcdef1234567890abcdef12345678"`
 *
 * #### appId (required)
 * - **Type:** `Address` - Application ID
 * - **Description:** The application ID used to lookup the App Auth contract in the KMS
 * - **Example:** `"0xabcdef1234567890abcdef1234567890abcdef12"`
 *
 * #### composeHash (required)
 * - **Type:** `string` - 32-byte hex string (with or without 0x prefix)
 * - **Description:** Hash of the app compose configuration to add to the allowed list
 * - **Calculation:** Can be calculated using `getComposeHash(appCompose)` utility function
 * - **Format:** Automatically converted to proper hex format using `asHex()` utility
 * - **Example:** `"abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"`
 *
 * #### privateKey (conditionally required)
 * - **Type:** `Hex` - Private key hex string
 * - **Description:** Private key of the account that has permission to add compose hashes (Mode 1). Either this OR `walletClient` must be provided, but not both.
 * - **Security:** Keep this secure and never expose in client-side code
 * - **Example:** `"0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"`
 *
 * #### walletClient (conditionally required)
 * - **Type:** `WalletClient` - Viem wallet client instance
 * - **Description:** Custom wallet client for advanced use cases (Mode 2). Either this OR `privateKey` must be provided, but not both.
 * - **Example:** Multi-sig wallet, hardware wallet, or any custom viem WalletClient
 *
 * #### publicClient (optional)
 * - **Type:** `PublicClient` - Viem public client instance
 * - **Description:** Custom public client for blockchain reads. If not provided, will create a default one using the chain configuration.
 *
 * #### skipPrerequisiteChecks (optional)
 * - **Type:** `boolean` - Default: `false`
 * - **Description:** Whether to skip network and balance prerequisite checks before transaction
 *
 * #### minBalance (optional)
 * - **Type:** `string` - ETH amount as string
 * - **Default:** `"0.001"` (0.001 ETH)
 * - **Description:** Minimum ETH balance required in the account
 * - **Example:** `"0.01"` for 0.01 ETH minimum balance
 *
 * ### schema (optional)
 *
 * - **Type:** `ZodSchema | false`
 * - **Default:** `AddComposeHashSchema`
 *
 * Schema to validate the response. Use `false` to return raw data without validation.
 *
 * ```typescript
 * // Use default schema
 * const result = await addComposeHash(request)
 *
 * // Return raw data without validation
 * const raw = await addComposeHash(request, { schema: false })
 *
 * // Use custom schema
 * const customSchema = z.object({ composeHash: z.string(), transactionHash: z.string() })
 * const custom = await addComposeHash(request, { schema: customSchema })
 * ```
 *
 * ## Safe Version
 *
 * Use `safeAddComposeHash` for error handling without exceptions:
 *
 * ```typescript
 * import { safeAddComposeHash } from '@phala/cloud'
 *
 * const result = await safeAddComposeHash(request)
 * if (result.success) {
 *   console.log(`Compose hash added: ${result.data.composeHash}`)
 * } else {
 *   if ("isRequestError" in result.error) {
 *     console.error(`Transaction failed: ${result.error.message}`)
 *   } else {
 *     console.error(`Validation error: ${result.error.issues}`)
 *   }
 * }
 * ```
 */

// KMS Auth ABI for apps lookup function
const kmsAuthAbi = [
  {
    inputs: [{ name: "app", type: "address" }],
    name: "apps",
    outputs: [
      { name: "isRegistered", type: "bool" },
      { name: "controller", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// App Auth ABI for addComposeHash function
const appAuthAbi = [
  {
    inputs: [{ name: "composeHash", type: "bytes32" }],
    name: "addComposeHash",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "composeHash", type: "bytes32", indexed: false }],
    name: "ComposeHashAdded",
    type: "event",
    anonymous: false,
  },
] as const;

// Request schema with conditional validation using Zod refine
const AddComposeHashRequestSchema = z
  .object({
    // Chain configuration (conditionally required)
    chain: z.unknown().optional(),

    // Contract configuration (required)
    kmsContractAddress: z.string(),
    appId: z.string(),
    composeHash: z.string(),

    // Authentication mode: either privateKey OR walletClient (required, mutually exclusive)
    privateKey: z.string().optional(),
    walletClient: z.unknown().optional(),

    // Public client (optional, will create default if not provided)
    publicClient: z.unknown().optional(),

    // Validation configuration (optional)
    skipPrerequisiteChecks: z.boolean().optional().default(false),
    minBalance: z.string().optional(), // ETH amount as string, e.g., "0.01"

    // Transaction control options
    timeout: z.number().optional().default(120000),
    retryOptions: z.unknown().optional(),
    signal: z.unknown().optional(),

    // Progress callbacks
    onTransactionStateChange: z.function().optional(),
    onTransactionSubmitted: z.function().optional(),
    onTransactionConfirmed: z.function().optional(),
  })
  .passthrough()
  .refine(
    (data) => {
      // XOR validation: exactly one auth method
      const hasPrivateKey = !!data.privateKey;
      const hasWalletClient = !!data.walletClient;
      return hasPrivateKey !== hasWalletClient;
    },
    {
      message: "Either 'privateKey' or 'walletClient' must be provided, but not both",
      path: ["privateKey", "walletClient"],
    },
  )
  .refine(
    (data) => {
      // Conditional chain requirement
      const hasPublicClient = !!data.publicClient;
      const hasWalletClient = !!data.walletClient;
      const hasChain = !!data.chain;

      // Chain optional when both clients provided
      if (hasPublicClient && hasWalletClient) return true;

      // Chain required to create missing client
      return hasChain;
    },
    {
      message: "Chain is required when publicClient or walletClient is not provided",
      path: ["chain"],
    },
  );

export type AddComposeHashRequest = {
  chain?: Chain;
  kmsContractAddress: Address;
  appId: Address;
  composeHash: string;
  privateKey?: Hex;
  walletClient?: WalletClient;
  publicClient?: PublicClient;

  // Validation configuration
  skipPrerequisiteChecks?: boolean;
  minBalance?: string;

  // Transaction control options
  timeout?: number;
  retryOptions?: RetryOptions;
  signal?: AbortSignal;

  // Progress callbacks
  onTransactionStateChange?: (state: TransactionTracker["status"]) => void;
  onTransactionSubmitted?: (hash: Hash) => void;
  onTransactionConfirmed?: (receipt: TransactionReceipt) => void;
};

// Response schema
export const AddComposeHashSchema = z
  .object({
    composeHash: z.string(),
    appAuthAddress: z.string(),
    appId: z.string(),
    transactionHash: z.string(),
    blockNumber: z.bigint().optional(),
    gasUsed: z.bigint().optional(),
  })
  .passthrough();

export type AddComposeHash = z.infer<typeof AddComposeHashSchema>;

// Conditional types for intelligent type inference
export type AddComposeHashParameters<T = undefined> = T extends z.ZodSchema
  ? { schema: T }
  : T extends false
    ? { schema: false }
    : { schema?: z.ZodSchema | false };

export type AddComposeHashReturnType<T = undefined> = T extends z.ZodSchema
  ? z.infer<T>
  : T extends false
    ? unknown
    : AddComposeHash;

// Helper function to parse result from transaction receipt
function parseComposeHashResult(
  receipt: TransactionReceipt,
  composeHash: Hash,
  appAuthAddress: Address,
  appId: Address,
): AddComposeHash {
  try {
    // Parse ComposeHashAdded event
    const logs = parseEventLogs({
      abi: appAuthAbi,
      eventName: "ComposeHashAdded",
      logs: receipt.logs,
      strict: false,
    });

    // ComposeHashAdded event is optional - the transaction may succeed without it
    if (logs.length > 0) {
      const event = logs[0];
      if (event?.args?.composeHash !== composeHash) {
        console.warn(
          `Event compose hash (${event?.args?.composeHash}) does not match expected (${composeHash})`,
        );
      }
    }

    return {
      composeHash: composeHash as string,
      appAuthAddress: appAuthAddress as string,
      appId: appId as string,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  } catch (parseError) {
    // If event parsing fails, still return basic result
    console.warn("Failed to parse ComposeHashAdded event, returning basic result:", parseError);
    return {
      composeHash: composeHash as string,
      appAuthAddress: appAuthAddress as string,
      appId: appId as string,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  }
}

// Standard version (throws on error)
export async function addComposeHash<T extends z.ZodSchema | false | undefined = undefined>(
  request: AddComposeHashRequest,
  parameters?: AddComposeHashParameters<T>,
): Promise<AddComposeHashReturnType<T>> {
  const validatedRequest = AddComposeHashRequestSchema.parse(request);

  const {
    chain,
    kmsContractAddress,
    appId,
    composeHash,
    privateKey,
    walletClient: providedWalletClient,
    publicClient: providedPublicClient,
    timeout = 120000,
    retryOptions,
    signal,
    onTransactionStateChange,
    onTransactionSubmitted,
    onTransactionConfirmed,
    skipPrerequisiteChecks = false,
    minBalance,
  } = validatedRequest;

  // Create or use provided clients
  let publicClient: PublicClient;
  let walletClient: WalletClient;
  let address: Address;
  let chainId: number;

  if (privateKey) {
    // Mode 1: Private key authentication
    const account = privateKeyToAccount(privateKey as Hex);

    if (providedPublicClient) {
      publicClient = providedPublicClient as PublicClient;
    } else {
      if (!chain) throw new Error("Chain required when creating publicClient");
      publicClient = createPublicClient({ chain: chain as Chain, transport: http() });
    }

    if (!chain) throw new Error("Chain required when creating walletClient");
    walletClient = createWalletClient({
      account,
      chain: chain as Chain,
      transport: http(),
    });

    address = account.address;
    chainId = (chain as Chain).id;
  } else if (providedWalletClient) {
    // Mode 2: Custom wallet client
    walletClient = providedWalletClient as WalletClient;

    if (providedPublicClient) {
      publicClient = providedPublicClient as PublicClient;
    } else {
      if (!chain) throw new Error("Chain required when creating publicClient");
      publicClient = createPublicClient({ chain: chain as Chain, transport: http() });
    }

    if (!walletClient.account?.address) {
      throw new Error("WalletClient must have an account with address");
    }
    address = walletClient.account.address;
    chainId = chain ? (chain as Chain).id : await walletClient.getChainId();
  } else {
    throw new Error("Either privateKey or walletClient must be provided");
  }

  // Create NetworkClients for utilities
  const networkClients: NetworkClients = {
    publicClient,
    walletClient,
    address: address,
    chainId: chainId,
  };

  // Create transaction tracker for state management
  const transactionTracker = createTransactionTracker();

  // Set up state change callback
  if (onTransactionStateChange && typeof onTransactionStateChange === "function") {
    const pollStatus = (): void => {
      onTransactionStateChange(transactionTracker.status);
      if (!transactionTracker.isComplete) {
        setTimeout(pollStatus, 100);
      }
    };
    setTimeout(pollStatus, 10);
  }

  // Perform prerequisite checks using network utilities
  if (!skipPrerequisiteChecks) {
    const requirements = {
      targetChainId: chainId,
      minBalance: minBalance ? parseEther(minBalance) : parseEther("0.001"),
    };

    const validation = await validateNetworkPrerequisites(networkClients, requirements);

    if (!validation.networkValid) {
      throw new Error(
        `Network mismatch: Expected chain ${requirements.targetChainId}, but wallet is on chain ${validation.details.currentChainId}`,
      );
    }

    if (!validation.balanceValid) {
      const requiredEth = Number(requirements.minBalance) / 1e18;
      const currentEth = Number(validation.details.balance) / 1e18;
      throw new Error(
        `Insufficient balance: Required ${requiredEth} ETH, but account has ${currentEth.toFixed(6)} ETH`,
      );
    }
  }

  // Define the blockchain operation
  const addComposeHashOperation = async (clients: NetworkClients): Promise<Hash> => {
    // Step 1: Look up App Auth contract address from KMS
    const appInfo = await clients.publicClient.readContract({
      address: kmsContractAddress as Address,
      abi: kmsAuthAbi,
      functionName: "apps",
      args: [appId as Address],
    });

    if (!appInfo || !appInfo[0]) {
      throw new Error(`App ${appId} is not registered in KMS contract ${kmsContractAddress}`);
    }

    const appAuthAddress = appInfo[1];
    if (!appAuthAddress) {
      throw new Error(`No controller address found for app ${appId}`);
    }

    // Step 2: Call addComposeHash on the App Auth contract
    const hash = await clients.walletClient.writeContract({
      address: appAuthAddress as Address,
      abi: appAuthAbi,
      functionName: "addComposeHash",
      args: [asHex(composeHash)],
      account: clients.walletClient.account || clients.address,
      chain: (chain as Chain) || null,
    });

    return hash;
  };

  // Execute transaction with enhanced features
  const transactionResult = retryOptions
    ? await executeTransactionWithRetry(
        addComposeHashOperation,
        networkClients,
        [],
        {
          timeout: timeout as number,
          confirmations: 1,
          onSubmitted: onTransactionSubmitted,
          onConfirmed: onTransactionConfirmed,
          signal: signal,
        } as TransactionOptions & { signal?: AbortSignal },
        retryOptions,
      )
    : await transactionTracker.execute(addComposeHashOperation, networkClients, [], {
        timeout: timeout as number,
        confirmations: 1,
        onSubmitted: onTransactionSubmitted,
        onConfirmed: onTransactionConfirmed,
        signal: signal,
      } as TransactionOptions & { signal?: AbortSignal });

  // Get App Auth address for the result (we need to look it up again)
  const appInfo = await publicClient.readContract({
    address: kmsContractAddress as Address,
    abi: kmsAuthAbi,
    functionName: "apps",
    args: [appId as Address],
  });

  const appAuthAddress = appInfo[1] as Address;

  // Parse result from receipt
  const result = parseComposeHashResult(
    transactionResult.receipt,
    asHex(composeHash),
    appAuthAddress,
    appId as Address,
  );

  // Schema handling
  if (parameters?.schema === false) {
    return result as AddComposeHashReturnType<T>;
  }

  const schema = (parameters?.schema || AddComposeHashSchema) as z.ZodSchema;
  return schema.parse(result) as AddComposeHashReturnType<T>;
}

// Safe version type definition
export type SafeAddComposeHashResult<T = undefined> =
  | {
      success: true;
      data: AddComposeHashReturnType<T>;
    }
  | {
      success: false;
      error: { isRequestError: true; message: string; status: number; detail: string };
    };

// Safe version (returns SafeResult)
export async function safeAddComposeHash<T extends z.ZodSchema | false | undefined = undefined>(
  request: AddComposeHashRequest,
  parameters?: AddComposeHashParameters<T>,
): Promise<SafeAddComposeHashResult<T>> {
  try {
    const result = await addComposeHash(request, parameters);
    return { success: true, data: result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown blockchain error";
    return {
      success: false,
      error: {
        isRequestError: true,
        message: errorMessage,
        status: 500, // Blockchain errors use 500
        detail: errorMessage,
      },
    };
  }
}
