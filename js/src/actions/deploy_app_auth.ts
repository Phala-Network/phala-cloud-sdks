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
 * Deploy an App Auth contract through a KMS (Key Management Service) factory.
 *
 * This function enables secure deployment of App Auth contracts that are registered
 * with a TEE (Trusted Execution Environment) KMS system. The deployed contract
 * provides authentication and authorization capabilities for applications running
 * in trusted environments.
 *
 * @group Actions
 * @since 0.1.0
 *
 * ## Usage
 *
 * ```typescript
 * import { deployAppAuth, getComposeHash } from '@phala/cloud'
 * import { base } from 'viem/chains'
 *
 * // Calculate compose hash from your app compose configuration
 * const appCompose = { services: { myapp: { image: "my-image" } } }
 * const composeHash = getComposeHash(appCompose)
 *
 * // Mode 1: Using private key (simple)
 * const result = await deployAppAuth({
 *   chain: base,
 *   kmsContractAddress: "0x1234567890abcdef1234567890abcdef12345678",
 *   privateKey: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
 *   deviceId: "1234567890abcdef1234567890abcdef", // Specifying deviceId automatically sets allowAnyDevice to false
 *   composeHash: composeHash,
 *   minBalance: "0.01" // Minimum ETH balance required
 * })
 *
 * // Mode 2: Using custom wallet client (multi-sig, wallet providers)
 * const result2 = await deployAppAuth({
 *   chain: base, // Required to create publicClient
 *   kmsContractAddress: "0x1234567890abcdef1234567890abcdef12345678",
 *   walletClient: myMultiSigWallet, // Your custom wallet client
 *   deviceId: "1234567890abcdef1234567890abcdef", // Specifying deviceId automatically sets allowAnyDevice to false
 *   composeHash: composeHash,
 *   skipPrerequisiteChecks: true // Skip if using custom wallet
 * })
 *
 * // Mode 3: Full custom (both clients provided, chain optional)
 * const result3 = await deployAppAuth({
 *   // chain is optional when both clients are provided
 *   kmsContractAddress: "0x1234567890abcdef1234567890abcdef12345678",
 *   walletClient: myCustomWallet,
 *   publicClient: myCustomPublicClient,
 *   allowAnyDevice: true, // Allow any device when no specific deviceId is provided
 *   skipPrerequisiteChecks: true
 * })
 *
 * console.log(`App deployed with ID: ${result.appId}`)
 * console.log(`Contract address: ${result.appAuthAddress}`)
 * // Output: { appId: "0x...", appAuthAddress: "0x...", transactionHash: "0x..." }
 * ```
 *
 * ## Returns
 *
 * `DeployAppAuth | unknown`
 *
 * Information about the deployed App Auth contract including the generated App ID,
 * contract address, and transaction hash. Return type depends on schema parameter.
 *
 * ## Parameters
 *
 * ### request (required)
 *
 * - **Type:** `DeployAppAuthRequest`
 *
 * Configuration object for the App Auth contract deployment. Contains the following fields:
 *
 * #### chain (conditionally required)
 * - **Type:** `Chain` - Viem chain configuration object
 * - **Description:** Blockchain network configuration. Required when creating publicClient or walletClient. Optional when both publicClient and walletClient are provided.
 * - **Usage:** Used to create missing clients (publicClient or walletClient) when not provided
 * - **Example:** `import { base } from 'viem/chains'`
 *
 * #### kmsContractAddress (required)
 * - **Type:** `Address` - Ethereum contract address
 * - **Description:** Address of the KMS factory contract that will deploy the App Auth contract
 * - **Example:** `"0x1234567890abcdef1234567890abcdef12345678"`
 *
 * #### privateKey (conditionally required)
 * - **Type:** `Hex` - Private key hex string
 * - **Description:** Private key of the deployer account (Mode 1). Either this OR `walletClient` must be provided, but not both.
 * - **Security:** Keep this secure and never expose in client-side code
 * - **Example:** `"0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"`
 *
 * #### walletClient (conditionally required)
 * - **Type:** `WalletClient` - Viem wallet client instance
 * - **Description:** Custom wallet client for advanced use cases (Mode 2). Supports multi-signature wallets, wallet providers, hardware wallets, etc. Either this OR `privateKey` must be provided, but not both.
 * - **Example:** Multi-sig wallet, hardware wallet, or any custom viem WalletClient
 *
 * #### publicClient (optional)
 * - **Type:** `PublicClient` - Viem public client instance
 * - **Description:** Custom public client for blockchain reads. If not provided, will create a default one using the chain configuration.
 * - **Usage:** Useful for custom RPC providers or caching strategies
 *
 * #### allowAnyDevice (optional)
 * - **Type:** `boolean` - Default: `false`
 * - **Description:** Controls device access management for app deployment. When `false`, only the specified device (via `deviceId`) can deploy applications. When `true`, any device can deploy applications.
 * - **Usage:** Automatically set to `false` when `deviceId` is specified (non-default). Set to `true` explicitly only when you want to allow any device to deploy.
 *
 * #### deviceId (optional)
 * - **Type:** `string` - 32-byte hex string (with or without 0x prefix)
 * - **Default:** `"0000000000000000000000000000000000000000000000000000000000000000"`
 * - **Description:** Device management identifier that controls which device is authorized to deploy applications. When specified (non-default), automatically sets `allowAnyDevice` to `false`.
 * - **Format:** Automatically converted to proper hex format using `asHex()` utility
 * - **Example:** `"1234567890abcdef1234567890abcdef"` → `"0x1234567890abcdef1234567890abcdef00000000000000000000000000000000"`
 *
 * #### composeHash (optional)
 * - **Type:** `string` - 32-byte hex string (with or without 0x prefix)
 * - **Default:** `"0000000000000000000000000000000000000000000000000000000000000000"`
 * - **Description:** Hash mapping of the app compose configuration version for integrity verification and version tracking. This creates a mapping between the deployed app and its specific compose configuration.
 * - **Calculation:** Can be calculated using `getComposeHash(appCompose)` utility function
 * - **Format:** Automatically converted to proper hex format using `asHex()` utility
 * - **Example:** `"abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"`
 *
 * #### disableUpgrades (optional)
 * - **Type:** `boolean` - Default: `false`
 * - **Description:** Whether to disable contract upgrades after deployment
 * - **Security:** Set to `true` for immutable contracts, `false` to allow future upgrades
 *
 * #### skipPrerequisiteChecks (optional)
 * - **Type:** `boolean` - Default: `false`
 * - **Description:** Whether to skip network and balance prerequisite checks before deployment
 * - **Usage:** Set to `true` when using custom wallet clients that handle their own validation
 *
 * #### minBalance (optional)
 * - **Type:** `string` - ETH amount as string
 * - **Default:** `"0.001"` (0.001 ETH)
 * - **Description:** Minimum ETH balance required in the deployer account
 * - **Example:** `"0.01"` for 0.01 ETH minimum balance
 *
 * ### schema (optional)
 *
 * - **Type:** `ZodSchema | false`
 * - **Default:** `DeployAppAuthSchema`
 *
 * Schema to validate the response. Use `false` to return raw data without validation.
 *
 * ```typescript
 * // Use default schema
 * const result = await deployAppAuth(request)
 *
 * // Return raw data without validation
 * const raw = await deployAppAuth(request, { schema: false })
 *
 * // Use custom schema
 * const customSchema = z.object({ appId: z.string(), appAuthAddress: z.string() })
 * const custom = await deployAppAuth(request, { schema: customSchema })
 *
 * // Multi-signature wallet example
 * import { createWalletClient, custom } from 'viem'
 * const multiSigWallet = createWalletClient({
 *   account: multiSigAccount,
 *   chain: base,
 *   transport: custom(window.ethereum)
 * })
 * const result = await deployAppAuth({
 *   chain: base,
 *   kmsContractAddress: "0x...",
 *   walletClient: multiSigWallet,
 *   skipPrerequisiteChecks: true
 * })
 * ```
 *
 * ## Safe Version
 *
 * Use `safeDeployAppAuth` for error handling without exceptions:
 *
 * ```typescript
 * import { safeDeployAppAuth } from '@phala/cloud'
 *
 * // Example with specific device (allowAnyDevice automatically set to false)
 * const result = await safeDeployAppAuth({
 *   chain: base,
 *   kmsContractAddress: "0x...",
 *   privateKey: "0x...",
 *   deviceId: "1234567890abcdef1234567890abcdef" // Automatically sets allowAnyDevice to false
 * })
 *
 * // Example allowing any device
 * const result2 = await safeDeployAppAuth({
 *   chain: base,
 *   kmsContractAddress: "0x...",
 *   privateKey: "0x...",
 *   allowAnyDevice: true // Explicitly allow any device
 * })
 *
 * if (result.success) {
 *   console.log(`App Auth deployed at: ${result.data.appAuthAddress}`)
 * } else {
 *   console.error(`Deployment failed: ${result.error.message}`)
 * }
 * ```
 */

// KMS Auth ABI for deployAndRegisterApp function
const kmsAuthAbi = [
  {
    inputs: [
      { name: "deployer", type: "address" },
      { name: "disableUpgrades", type: "bool" },
      { name: "allowAnyDevice", type: "bool" },
      { name: "deviceId", type: "bytes32" },
      { name: "composeHash", type: "bytes32" },
    ],
    name: "deployAndRegisterApp",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "appId", type: "address", indexed: true },
      { name: "proxyAddress", type: "address", indexed: true },
      { name: "deployer", type: "address", indexed: true },
    ],
    name: "AppDeployedViaFactory",
    type: "event",
    anonymous: false,
  },
  {
    inputs: [{ name: "appId", type: "address", indexed: false }],
    name: "AppRegistered",
    type: "event",
    anonymous: false,
  },
] as const;

// Basic request schema without complex transforms
const DeployAppAuthRequestBaseSchema = z
  .object({
    // Chain configuration (conditionally required)
    chain: z.unknown().optional(),

    // Contract configuration (required)
    kmsContractAddress: z.string(),

    // Authentication mode: either privateKey OR walletClient (required, mutually exclusive)
    privateKey: z.string().optional(),
    walletClient: z.unknown().optional(),

    // Public client (optional, will create default if not provided)
    publicClient: z.unknown().optional(),

    // App configuration (optional)
    allowAnyDevice: z.boolean().optional().default(false),
    deviceId: z
      .string()
      .optional()
      .default("0000000000000000000000000000000000000000000000000000000000000000"),
    composeHash: z
      .string()
      .optional()
      .default("0000000000000000000000000000000000000000000000000000000000000000"),
    disableUpgrades: z.boolean().optional().default(false),

    // Validation configuration (optional)
    skipPrerequisiteChecks: z.boolean().optional().default(false),
    minBalance: z.string().optional(), // ETH amount as string, e.g., "0.01"
  })
  .passthrough();

// Request schema with validation
export const DeployAppAuthRequestSchema = DeployAppAuthRequestBaseSchema.refine(
  (data) => {
    // Ensure either privateKey or walletClient is provided, but not both
    const hasPrivateKey = !!data.privateKey;
    const hasWalletClient = !!data.walletClient;
    return hasPrivateKey !== hasWalletClient; // XOR: exactly one should be true
  },
  {
    message: "Either 'privateKey' or 'walletClient' must be provided, but not both",
    path: ["privateKey", "walletClient"],
  },
).refine(
  (data) => {
    // If both publicClient and walletClient are provided, chain is optional
    // Otherwise, chain is required to create the missing client
    const hasPublicClient = !!data.publicClient;
    const hasWalletClient = !!data.walletClient;
    const hasChain = !!data.chain;

    // If we have both clients, chain is optional
    if (hasPublicClient && hasWalletClient) {
      return true;
    }

    // If we're missing at least one client, we need chain to create it
    return hasChain;
  },
  {
    message: "Chain is required when publicClient or walletClient is not provided",
    path: ["chain"],
  },
);

export type DeployAppAuthRequest = {
  chain?: Chain;
  kmsContractAddress: Address;
  privateKey?: Hex;
  walletClient?: WalletClient;
  publicClient?: PublicClient;
  allowAnyDevice?: boolean;
  deviceId?: string;
  composeHash?: string;
  disableUpgrades?: boolean;
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

// Response schema for deployment result
export const DeployAppAuthSchema = z
  .object({
    appId: z.string(),
    appAuthAddress: z.string(),
    deployer: z.string(),
    transactionHash: z.string(),
    blockNumber: z.bigint().optional(),
    gasUsed: z.bigint().optional(),
  })
  .passthrough();

export type DeployAppAuth = z.infer<typeof DeployAppAuthSchema>;

// Parameters type for optional configuration
export type DeployAppAuthParameters<T = undefined> = T extends z.ZodSchema
  ? { schema: T }
  : T extends false
    ? { schema: false }
    : { schema?: z.ZodSchema | false };

export type DeployAppAuthReturnType<T = undefined> = T extends z.ZodSchema
  ? z.infer<T>
  : T extends false
    ? unknown
    : DeployAppAuth;

// Helper function to parse deployment result from transaction receipt
function parseDeploymentResult(
  receipt: TransactionReceipt,
  deployer: Address,
  kmsContractAddress: Address,
): DeployAppAuth {
  try {
    // Parse AppDeployedViaFactory event
    const logs = parseEventLogs({
      abi: kmsAuthAbi,
      eventName: "AppDeployedViaFactory",
      logs: receipt.logs,
      strict: false,
    });

    if (logs.length === 0) {
      // Check if transaction actually failed
      if (receipt.status === "reverted") {
        throw new Error(`Transaction failed: ${receipt.transactionHash}`);
      }

      throw new Error(
        `Transaction ${receipt.transactionHash} has no AppDeployedViaFactory events. The deployment failed. Status: ${receipt.status}. Found ${receipt.logs.length} logs.`,
      );
    }

    const deploymentEvent = logs[0];
    if (!deploymentEvent?.args) {
      throw new Error("Event has no data");
    }

    const { appId, proxyAddress, deployer: eventDeployer } = deploymentEvent.args;

    if (!appId) {
      throw new Error("Event missing appId");
    }
    if (!proxyAddress) {
      throw new Error("Event missing proxyAddress");
    }

    return {
      appId: appId as string,
      appAuthAddress: proxyAddress as string,
      deployer: deployer,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Parse failed: ${error}`);
  }
}

// Standard version (throws on error)
export async function deployAppAuth<T extends z.ZodSchema | false | undefined = undefined>(
  request: DeployAppAuthRequest,
  parameters?: DeployAppAuthParameters<T>,
): Promise<DeployAppAuthReturnType<T>> {
  // Validate request data
  const validatedRequest = DeployAppAuthRequestSchema.parse(request);

  const {
    chain,
    kmsContractAddress,
    privateKey,
    walletClient: providedWalletClient,
    publicClient: providedPublicClient,
    allowAnyDevice: rawAllowAnyDevice = false,
    deviceId = "0000000000000000000000000000000000000000000000000000000000000000",
    composeHash = "0000000000000000000000000000000000000000000000000000000000000000",
    disableUpgrades = false,
    skipPrerequisiteChecks = false,
    minBalance,
    timeout = 120000, // 2 minutes default
    retryOptions,
    signal,
    onTransactionStateChange,
    onTransactionSubmitted,
    onTransactionConfirmed,
  } = validatedRequest;

  // Auto-determine allowAnyDevice based on deviceId
  const defaultDeviceId = "0000000000000000000000000000000000000000000000000000000000000000";
  const hasSpecificDevice = deviceId !== defaultDeviceId && deviceId !== "0x" + defaultDeviceId;
  const allowAnyDevice = hasSpecificDevice ? false : rawAllowAnyDevice;

  // Create or use provided clients
  let publicClient: PublicClient;
  let walletClient: WalletClient;
  let deployerAddress: Address;
  let chainId: number;

  if (privateKey) {
    // Mode 1: Private key authentication
    const account = privateKeyToAccount(privateKey as Hex);

    // Use provided publicClient or create one (chain required if creating)
    if (providedPublicClient) {
      // Type guard for publicClient
      if (typeof providedPublicClient !== "object" || !providedPublicClient) {
        throw new Error("publicClient is invalid");
      }
      publicClient = providedPublicClient as PublicClient;
    } else {
      if (!chain) {
        throw new Error("Chain required for publicClient");
      }
      publicClient = createPublicClient({
        chain: chain as Chain,
        transport: http(),
      });
    }

    // Create walletClient (chain required)
    if (!chain) {
      throw new Error("Chain required for walletClient");
    }
    walletClient = createWalletClient({
      account,
      chain: chain as Chain,
      transport: http(),
    });

    deployerAddress = account.address;
    chainId = (chain as Chain).id;
  } else if (providedWalletClient) {
    // Mode 2: Custom wallet client (multi-sig, wallet providers, etc.)
    // Type guard for walletClient
    if (typeof providedWalletClient !== "object" || !providedWalletClient) {
      throw new Error("walletClient is invalid");
    }
    walletClient = providedWalletClient as WalletClient;

    // Use provided publicClient or create one (chain required if creating)
    if (providedPublicClient) {
      // Type guard for publicClient
      if (typeof providedPublicClient !== "object" || !providedPublicClient) {
        throw new Error("publicClient is invalid");
      }
      publicClient = providedPublicClient as PublicClient;
    } else {
      if (!chain) {
        throw new Error("Chain required for publicClient");
      }
      publicClient = createPublicClient({
        chain: chain as Chain,
        transport: http(),
      });
    }

    // Get deployer address from wallet client
    if (!walletClient.account?.address) {
      throw new Error("WalletClient needs an account");
    }
    deployerAddress = walletClient.account.address;

    // Get chainId from chain or walletClient
    if (chain) {
      chainId = (chain as Chain).id;
    } else {
      chainId = await walletClient.getChainId();
    }
  } else {
    throw new Error("Need privateKey or walletClient");
  }

  // Create NetworkClients for prerequisite checks and transaction execution
  const networkClients: NetworkClients = {
    publicClient,
    walletClient,
    address: deployerAddress,
    chainId: chainId,
  };

  // Create transaction tracker for better state management
  const transactionTracker = createTransactionTracker();

  // Set up state change callback
  if (onTransactionStateChange && typeof onTransactionStateChange === "function") {
    const pollStatus = (): void => {
      (onTransactionStateChange as (state: TransactionTracker["status"]) => void)(
        transactionTracker.status,
      );
      if (!transactionTracker.isComplete) {
        setTimeout(pollStatus, 100); // Poll every 100ms
      }
    };
    // Start polling after a small delay to allow tracker initialization
    setTimeout(pollStatus, 10);
  }

  // Perform prerequisite checks
  if (!skipPrerequisiteChecks) {
    const requirements = {
      targetChainId: chainId,
      minBalance: minBalance ? parseEther(minBalance) : parseEther("0.001"), // Default 0.001 ETH
    };

    const validation = await validateNetworkPrerequisites(networkClients, requirements);

    if (!validation.networkValid) {
      throw new Error(
        `Wrong network. Need chain ${requirements.targetChainId}, got ${validation.details.currentChainId}`,
      );
    }

    if (!validation.balanceValid) {
      const requiredEth = Number(requirements.minBalance) / 1e18;
      const currentEth = Number(validation.details.balance) / 1e18;
      throw new Error(`Not enough ETH. Need ${requiredEth}, have ${currentEth.toFixed(6)}`);
    }
  }

  // Convert string parameters to proper hex format with padding
  const deviceIdHex = asHex(deviceId);
  const composeHashHex = asHex(composeHash);

  // Ensure 32-byte (64-character) hex strings with 0x prefix
  const deviceIdBytes = `0x${deviceIdHex.slice(2).padEnd(64, "0")}` as Hash;
  const composeHashBytes = `0x${composeHashHex.slice(2).padEnd(64, "0")}` as Hash;

  // Define the deployment operation
  const deployOperation = async (clients: NetworkClients): Promise<Hash> => {
    // Verify KMS contract exists at the given address
    try {
      const code = await clients.publicClient.getCode({ address: kmsContractAddress as Address });
      if (!code || code === "0x") {
        throw new Error(`No contract at ${kmsContractAddress}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("No contract at")) {
        throw error;
      }
      // Silently continue if contract verification fails for other reasons
      // (e.g., RPC issues, network problems)
    }

    const contractCall = {
      address: kmsContractAddress as Address,
      abi: kmsAuthAbi,
      functionName: "deployAndRegisterApp" as const,
      args: [
        clients.address,
        disableUpgrades,
        allowAnyDevice,
        deviceIdBytes,
        composeHashBytes,
      ] as const,
      account: clients.walletClient.account || clients.address,
      chain: (chain as Chain) || null,
    };

    return await clients.walletClient.writeContract(contractCall);
  };

  // Execute transaction with enhanced features
  const transactionResult = retryOptions
    ? await executeTransactionWithRetry(
        deployOperation,
        networkClients,
        [],
        {
          timeout: timeout as number,
          confirmations: 1,
          onSubmitted: onTransactionSubmitted as ((hash: Hash) => void) | undefined,
          onConfirmed: onTransactionConfirmed as
            | ((receipt: TransactionReceipt) => void)
            | undefined,
          signal: signal as AbortSignal | undefined,
        } as TransactionOptions & { signal?: AbortSignal },
        retryOptions,
      )
    : await transactionTracker.execute(deployOperation, networkClients, [], {
        timeout: timeout as number,
        confirmations: 1,
        onSubmitted: onTransactionSubmitted as ((hash: Hash) => void) | undefined,
        onConfirmed: onTransactionConfirmed as ((receipt: TransactionReceipt) => void) | undefined,
        signal: signal as AbortSignal | undefined,
      } as TransactionOptions & { signal?: AbortSignal });

  // Parse result from receipt
  const result = parseDeploymentResult(
    transactionResult.receipt,
    deployerAddress,
    kmsContractAddress as Address,
  );

  if (parameters?.schema === false) {
    return result as DeployAppAuthReturnType<T>;
  }

  const schema = (parameters?.schema || DeployAppAuthSchema) as z.ZodSchema;
  return schema.parse(result) as DeployAppAuthReturnType<T>;
}

/**
 * Enhanced safe version with transaction tracking capabilities
 */
export type SafeDeployAppAuthResult<T = undefined> =
  | {
      success: true;
      data: DeployAppAuthReturnType<T>;
    }
  | {
      success: false;
      error: { isRequestError: true; message: string; status: number; detail: string };
    };

// Safe version (returns SafeResult with optional transaction tracker)
export async function safeDeployAppAuth<T extends z.ZodSchema | false | undefined = undefined>(
  request: DeployAppAuthRequest,
  parameters?: DeployAppAuthParameters<T>,
): Promise<SafeDeployAppAuthResult<T>> {
  try {
    const result = await deployAppAuth(request, parameters);
    return { success: true, data: result };
  } catch (error) {
    // Create a consistent error format for blockchain operations
    const errorMessage = error instanceof Error ? error.message : "Unknown deployment error";
    const requestError = {
      isRequestError: true as const,
      message: errorMessage,
      status: 500, // Use 500 for blockchain errors since they're not HTTP errors
      detail: errorMessage,
    };
    return {
      success: false,
      error: requestError,
    };
  }
}
