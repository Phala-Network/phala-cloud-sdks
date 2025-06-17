export { encryptEnvVars } from "@phala/dstack-sdk/encrypt-env-vars";
export { getComposeHash, type AppCompose } from "./get_compose_hash";
export { getErrorMessage } from "./get_error_message";
export { asHex } from "./as-hex";

// Network utilities
export {
  // Core network functions
  createNetworkClients,
  extractNetworkClients,
  // Network operations
  checkNetworkStatus,
  checkBalance,
  validateNetworkPrerequisites,
  // Transaction utilities
  waitForTransactionReceipt,
  executeTransaction,
  // Error classes
  NetworkError,
  WalletError,
  TransactionError,
  // Types
  type NetworkConfig,
  type WalletConnection,
  type NetworkClients,
  type BalanceCheckResult,
  type TransactionOptions,
  type TransactionResult,
} from "./network";

// Transaction utilities
export {
  // Transaction tracking
  createTransactionTracker,
  // Batch operations
  executeBatchTransactions,
  // Retry mechanisms
  executeTransactionWithRetry,
  // Gas estimation
  estimateTransactionGas,
  // Types
  type TransactionState,
  type TransactionStatus,
  type TransactionTracker,
  type BatchTransactionOptions,
  type BatchTransactionResult,
  type RetryOptions,
  type GasEstimationOptions,
} from "./transaction";

// Optional convenience functions (not required, but helpful for quick start)
export {
  // Convenience client factories
  createClientsFromPrivateKey,
  createClientsFromBrowser,
  autoCreateClients,
  // Convenience browser operations
  switchToNetwork,
  addNetwork,
} from "./client-factories";
