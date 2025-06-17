import type { Hash, TransactionReceipt } from "viem";
import {
  NetworkClients,
  TransactionOptions,
  TransactionResult,
  TransactionError,
  waitForTransactionReceipt,
} from "./network";

// Transaction state tracking
export type TransactionState = "idle" | "submitting" | "pending" | "success" | "error" | "timeout";

export interface TransactionStatus {
  state: TransactionState;
  hash?: Hash;
  receipt?: TransactionReceipt;
  error?: string;
  startTime?: number;
  submitTime?: number;
  confirmTime?: number;
  aborted?: boolean;
}

export interface TransactionTracker {
  readonly status: TransactionStatus;
  readonly isIdle: boolean;
  readonly isSubmitting: boolean;
  readonly isPending: boolean;
  readonly isSuccess: boolean;
  readonly isError: boolean;
  readonly isTimeout: boolean;
  readonly isAborted: boolean;
  readonly isComplete: boolean;
  abort(): void;
  reset(): void;
  execute<T extends unknown[]>(
    operation: (clients: NetworkClients, ...args: T) => Promise<Hash>,
    clients: NetworkClients,
    args: T,
    options?: TransactionOptions & { signal?: AbortSignal },
  ): Promise<TransactionResult>;
}

/**
 * Create a transaction tracker for monitoring transaction state
 */
export function createTransactionTracker(): TransactionTracker {
  let status: TransactionStatus = { state: "idle" };
  let timeoutHandle: NodeJS.Timeout | undefined;
  let abortController: AbortController | undefined;

  const updateStatus = (newStatus: Partial<TransactionStatus>) => {
    status = { ...status, ...newStatus };
  };

  const reset = () => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = undefined;
    }
    if (abortController) {
      abortController.abort();
      abortController = undefined;
    }
    status = { state: "idle" };
  };

  const abort = () => {
    if (abortController) {
      abortController.abort();
    }
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = undefined;
    }
    updateStatus({
      state: "error",
      aborted: true,
      error: "Transaction aborted by user",
    });
  };

  const execute = async <T extends unknown[]>(
    operation: (clients: NetworkClients, ...args: T) => Promise<Hash>,
    clients: NetworkClients,
    args: T,
    options: TransactionOptions & { signal?: AbortSignal } = {},
  ): Promise<TransactionResult> => {
    const {
      timeout = 60000,
      confirmations = 1,
      onSubmitted,
      onConfirmed,
      onError,
      signal,
    } = options;

    try {
      // Reset and start
      reset();
      abortController = new AbortController();

      // Connect external abort signal if provided
      if (signal) {
        if (signal.aborted) {
          throw new TransactionError("Operation was aborted before execution");
        }
        signal.addEventListener("abort", () => {
          abort();
        });
      }

      updateStatus({
        state: "submitting",
        startTime: Date.now(),
        error: undefined,
        hash: undefined,
        receipt: undefined,
        aborted: false,
      });

      // Check for abort before execution
      if (abortController.signal.aborted) {
        throw new TransactionError("Transaction aborted");
      }

      // Execute the transaction
      const hash = await operation(clients, ...args);

      // Check for abort after submission
      if (abortController.signal.aborted) {
        throw new TransactionError("Transaction aborted after submission", hash);
      }

      updateStatus({
        state: "pending",
        hash,
        submitTime: Date.now(),
      });

      onSubmitted?.(hash);

      // Set up timeout
      if (timeout > 0) {
        timeoutHandle = setTimeout(() => {
          if (status.state === "pending" && !abortController?.signal.aborted) {
            updateStatus({
              state: "timeout",
              error: `Transaction timeout after ${timeout}ms`,
            });
          }
        }, timeout);
      }

      // Wait for receipt with abort signal support
      const receipt = await Promise.race([
        waitForTransactionReceipt(clients.publicClient, hash, { timeout, confirmations }),
        new Promise<never>((_, reject) => {
          abortController?.signal.addEventListener("abort", () => {
            reject(new TransactionError("Transaction aborted while waiting for receipt", hash));
          });
        }),
      ]);

      // Clear timeout on success
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }

      const success = receipt.status === "success";

      updateStatus({
        state: success ? "success" : "error",
        receipt,
        confirmTime: Date.now(),
        error: success ? undefined : "Transaction failed on-chain",
      });

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
              status.hash,
              error,
            );

      updateStatus({
        state: "error",
        error: txError.message,
      });

      onError?.(txError, status.hash);
      throw txError;
    }
  };

  return {
    get status() {
      return { ...status };
    },
    get isIdle() {
      return status.state === "idle";
    },
    get isSubmitting() {
      return status.state === "submitting";
    },
    get isPending() {
      return status.state === "pending";
    },
    get isSuccess() {
      return status.state === "success";
    },
    get isError() {
      return status.state === "error";
    },
    get isTimeout() {
      return status.state === "timeout";
    },
    get isAborted() {
      return status.aborted === true;
    },
    get isComplete() {
      return ["success", "error", "timeout"].includes(status.state);
    },
    abort,
    reset,
    execute,
  };
}

/**
 * Batch transaction executor with sequential or parallel execution
 */
export interface BatchTransactionOptions {
  mode: "sequential" | "parallel";
  failFast?: boolean; // Stop on first error (sequential mode only)
  timeout?: number;
  onProgress?: (completed: number, total: number, results: (TransactionResult | Error)[]) => void;
}

export interface BatchTransactionResult {
  results: (TransactionResult | Error)[];
  successCount: number;
  errorCount: number;
  allSuccessful: boolean;
}

/**
 * Execute multiple transactions in batch
 */
export async function executeBatchTransactions<T extends unknown[]>(
  operations: Array<{
    operation: (clients: NetworkClients, ...args: T) => Promise<Hash>;
    args: T;
    options?: TransactionOptions;
  }>,
  clients: NetworkClients,
  batchOptions: BatchTransactionOptions,
): Promise<BatchTransactionResult> {
  const { mode, failFast = false, onProgress } = batchOptions;
  const results: (TransactionResult | Error)[] = [];

  if (mode === "sequential") {
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (!op) continue;
      const { operation, args, options } = op;

      try {
        const tracker = createTransactionTracker();
        const result = await tracker.execute(operation, clients, args, options);
        results.push(result);

        onProgress?.(i + 1, operations.length, results);
      } catch (error) {
        const txError = error instanceof Error ? error : new Error(String(error));
        results.push(txError);

        onProgress?.(i + 1, operations.length, results);

        if (failFast) {
          // Fill remaining slots with the same error
          for (let j = i + 1; j < operations.length; j++) {
            results.push(new Error("Cancelled due to previous failure"));
          }
          break;
        }
      }
    }
  } else {
    // Parallel execution
    const promises = operations.map(async ({ operation, args, options }) => {
      try {
        const tracker = createTransactionTracker();
        return await tracker.execute(operation, clients, args, options);
      } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
      }
    });

    const allResults = await Promise.allSettled(promises);
    results.push(...allResults.map((r) => (r.status === "fulfilled" ? r.value : r.reason)));

    onProgress?.(operations.length, operations.length, results);
  }

  const successCount = results.filter((r) => !(r instanceof Error)).length;
  const errorCount = results.length - successCount;

  return {
    results,
    successCount,
    errorCount,
    allSuccessful: errorCount === 0,
  };
}

/**
 * Transaction retry utility with exponential backoff
 */
export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  retryCondition?: (error: Error) => boolean;
}

export async function executeTransactionWithRetry<T extends unknown[]>(
  operation: (clients: NetworkClients, ...args: T) => Promise<Hash>,
  clients: NetworkClients,
  args: T,
  options: TransactionOptions = {},
  retryOptions: RetryOptions = {},
): Promise<TransactionResult> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    retryCondition = () => true,
  } = retryOptions;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const tracker = createTransactionTracker();
      return await tracker.execute(operation, clients, args, options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Check if we should retry this error
      if (!retryCondition(lastError)) {
        break;
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffFactor, maxDelay);
    }
  }

  throw lastError!;
}

/**
 * Smart gas estimation and transaction optimization
 */
export interface GasEstimationOptions {
  gasLimitMultiplier?: number;
  maxFeePerGasMultiplier?: number;
  priorityFeeMultiplier?: number;
}

export async function estimateTransactionGas(
  clients: NetworkClients,
  transaction: Parameters<typeof clients.publicClient.estimateGas>[0],
  options: GasEstimationOptions = {},
): Promise<{
  gasLimit: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}> {
  const {
    gasLimitMultiplier = 1.2,
    maxFeePerGasMultiplier = 1.1,
    priorityFeeMultiplier = 1.1,
  } = options;

  try {
    // Estimate gas limit
    const estimatedGas = await clients.publicClient.estimateGas(transaction);
    const gasLimit = BigInt(Math.ceil(Number(estimatedGas) * gasLimitMultiplier));

    // Get current gas prices (EIP-1559)
    let maxFeePerGas: bigint | undefined;
    let maxPriorityFeePerGas: bigint | undefined;

    try {
      const feeData = await clients.publicClient.estimateFeesPerGas();
      if (feeData.maxFeePerGas) {
        maxFeePerGas = BigInt(Math.ceil(Number(feeData.maxFeePerGas) * maxFeePerGasMultiplier));
      }
      if (feeData.maxPriorityFeePerGas) {
        maxPriorityFeePerGas = BigInt(
          Math.ceil(Number(feeData.maxPriorityFeePerGas) * priorityFeeMultiplier),
        );
      }
    } catch (error) {
      // EIP-1559 not supported, fallback to legacy gas price
      // maxFeePerGas and maxPriorityFeePerGas will remain undefined
    }

    return {
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };
  } catch (error) {
    throw new TransactionError(
      `Gas estimation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      undefined,
      error,
    );
  }
}
