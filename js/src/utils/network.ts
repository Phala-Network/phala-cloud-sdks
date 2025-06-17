import {
  type Chain,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
  type TransactionReceipt,
} from "viem";

// Core types for blockchain operations
export interface NetworkClients {
  publicClient: PublicClient;
  walletClient: WalletClient;
  address: Address;
  chainId: number;
}

// Optional configuration types for convenience functions
export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  blockExplorer?: string;
}

export interface WalletConnection {
  address: Address;
  chainId: number;
}

export interface BalanceCheckResult {
  address: Address;
  balance: bigint;
  sufficient: boolean;
  required?: bigint;
}

export interface TransactionOptions {
  timeout?: number; // in milliseconds
  confirmations?: number;
  onSubmitted?: (hash: Hash) => void;
  onConfirmed?: (receipt: TransactionReceipt) => void;
  onError?: (error: Error, hash?: Hash) => void;
}

export interface TransactionResult {
  hash: Hash;
  receipt: TransactionReceipt;
  success: boolean;
}

// Error types for better error handling
export class NetworkError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

export class WalletError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "WalletError";
  }
}

export class TransactionError extends Error {
  constructor(
    message: string,
    public hash?: Hash,
    public details?: unknown,
  ) {
    super(message);
    this.name = "TransactionError";
  }
}

/**
 * Create a NetworkClients object from existing viem clients
 * This is the primary way to create NetworkClients - the caller provides pre-configured clients
 */
export function createNetworkClients(
  publicClient: PublicClient,
  walletClient: WalletClient,
  address: Address,
  chainId: number,
): NetworkClients {
  return {
    publicClient,
    walletClient,
    address,
    chainId,
  };
}

/**
 * Check wallet connection and network status
 */
export async function checkNetworkStatus(
  clients: NetworkClients,
  targetChainId: number,
): Promise<{ isCorrectNetwork: boolean; currentChainId: number }> {
  try {
    const currentChainId = await clients.walletClient.getChainId();
    return {
      isCorrectNetwork: currentChainId === targetChainId,
      currentChainId,
    };
  } catch (error) {
    throw new NetworkError(
      `Failed to check network status: ${error instanceof Error ? error.message : "Unknown error"}`,
      "NETWORK_CHECK_FAILED",
      error,
    );
  }
}

/**
 * Check wallet balance
 */
export async function checkBalance(
  publicClient: PublicClient,
  address: Address,
  minBalance?: bigint,
): Promise<BalanceCheckResult> {
  try {
    const balance = await publicClient.getBalance({ address });

    return {
      address,
      balance,
      sufficient: minBalance ? balance >= minBalance : true,
      required: minBalance,
    };
  } catch (error) {
    throw new NetworkError(
      `Failed to check balance: ${error instanceof Error ? error.message : "Unknown error"}`,
      "BALANCE_CHECK_FAILED",
      error,
    );
  }
}

/**
 * Wait for transaction receipt with timeout and polling
 */
export async function waitForTransactionReceipt(
  publicClient: PublicClient,
  hash: Hash,
  options: {
    timeout?: number;
    pollingInterval?: number;
    confirmations?: number;
  } = {},
): Promise<TransactionReceipt> {
  const {
    timeout = 60000, // 60 seconds default
    pollingInterval = 2000, // 2 seconds default
    confirmations = 1,
  } = options;

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash });

        if (receipt) {
          // Check if we need to wait for additional confirmations
          if (confirmations > 1) {
            const currentBlock = await publicClient.getBlockNumber();
            const confirmationCount = currentBlock - receipt.blockNumber + 1n;

            if (confirmationCount < BigInt(confirmations)) {
              // Not enough confirmations yet, continue polling
              const elapsed = Date.now() - startTime;
              if (elapsed >= timeout) {
                reject(
                  new TransactionError(`Transaction confirmation timeout after ${timeout}ms`, hash),
                );
                return;
              }
              setTimeout(poll, pollingInterval);
              return;
            }
          }

          resolve(receipt);
        } else {
          // Transaction not yet mined
          const elapsed = Date.now() - startTime;
          if (elapsed >= timeout) {
            reject(new TransactionError(`Transaction receipt timeout after ${timeout}ms`, hash));
            return;
          }
          setTimeout(poll, pollingInterval);
        }
      } catch (error) {
        // Check if it's just "transaction not found" error, continue polling
        const elapsed = Date.now() - startTime;
        if (elapsed >= timeout) {
          reject(
            new TransactionError(`Transaction receipt timeout after ${timeout}ms`, hash, error),
          );
          return;
        }
        setTimeout(poll, pollingInterval);
      }
    };

    // Start polling immediately
    poll();
  });
}

/**
 * Execute a transaction with automatic receipt waiting and error handling
 */
export async function executeTransaction<T extends unknown[]>(
  clients: NetworkClients,
  operation: (clients: NetworkClients, ...args: T) => Promise<Hash>,
  args: T,
  options: TransactionOptions = {},
): Promise<TransactionResult> {
  const { timeout = 60000, confirmations = 1, onSubmitted, onConfirmed, onError } = options;

  try {
    // Execute the transaction
    const hash = await operation(clients, ...args);

    onSubmitted?.(hash);

    // Wait for receipt
    const receipt = await waitForTransactionReceipt(clients.publicClient, hash, {
      timeout,
      confirmations,
    });

    const success = receipt.status === "success";

    if (success) {
      onConfirmed?.(receipt);
    } else {
      const error = new TransactionError("Transaction failed on-chain", hash, receipt);
      onError?.(error, hash);
      throw error;
    }

    return {
      hash,
      receipt,
      success,
    };
  } catch (error) {
    const txError =
      error instanceof TransactionError
        ? error
        : new TransactionError(
            `Transaction execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            undefined,
            error,
          );

    onError?.(txError, txError.hash);
    throw txError;
  }
}

/**
 * Extract NetworkClients info from existing viem clients
 * Useful when you have existing clients and want to create a NetworkClients object
 */
export async function extractNetworkClients(
  publicClient: PublicClient,
  walletClient: WalletClient,
): Promise<NetworkClients> {
  try {
    const address = walletClient.account?.address;
    if (!address) {
      throw new WalletError("WalletClient must have an account", "NO_ACCOUNT");
    }

    const chainId = await walletClient.getChainId();

    return createNetworkClients(publicClient, walletClient, address, chainId);
  } catch (error) {
    throw new WalletError(
      `Failed to extract network clients: ${error instanceof Error ? error.message : "Unknown error"}`,
      "EXTRACTION_FAILED",
      error,
    );
  }
}

/**
 * Comprehensive network validation
 */
export async function validateNetworkPrerequisites(
  clients: NetworkClients,
  requirements: {
    targetChainId: number;
    minBalance?: bigint;
    requiredAddress?: Address;
  },
): Promise<{
  networkValid: boolean;
  balanceValid: boolean;
  addressValid: boolean;
  details: {
    currentChainId: number;
    balance: bigint;
    address: Address;
  };
}> {
  const { targetChainId, minBalance, requiredAddress } = requirements;

  // Check network
  const networkStatus = await checkNetworkStatus(clients, targetChainId);

  // Check balance
  const balanceResult = await checkBalance(clients.publicClient, clients.address, minBalance);

  // Check address if required
  const addressValid = requiredAddress
    ? clients.address.toLowerCase() === requiredAddress.toLowerCase()
    : true;

  return {
    networkValid: networkStatus.isCorrectNetwork,
    balanceValid: balanceResult.sufficient,
    addressValid,
    details: {
      currentChainId: networkStatus.currentChainId,
      balance: balanceResult.balance,
      address: clients.address,
    },
  };
}
