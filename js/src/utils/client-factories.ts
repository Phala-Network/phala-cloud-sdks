import {
  createPublicClient,
  createWalletClient,
  http,
  custom,
  type Chain,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createNetworkClients,
  extractNetworkClients,
  WalletError,
  NetworkError,
  type NetworkClients,
} from "./network";

/**
 * OPTIONAL CONVENIENCE FUNCTIONS
 *
 * These functions are provided for convenience but are not required.
 * You can create your own viem clients and use createNetworkClients() directly.
 *
 * These functions demonstrate common patterns but should not limit your flexibility.
 */

// Browser environment detection
function isBrowser(): boolean {
  // biome-ignore lint/suspicious/noExplicitAny: window.ethereum type checking is handled separately
  return typeof window !== "undefined" && typeof (window as any).ethereum !== "undefined";
}

// EIP-1193 Provider interface for browser environments
interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

// Get Ethereum provider in browser environment
function getEthereumProvider(): EthereumProvider | null {
  if (!isBrowser()) return null;
  // biome-ignore lint/suspicious/noExplicitAny: window.ethereum type checking is handled separately
  const ethereum = (window as any).ethereum as EthereumProvider | undefined;
  return ethereum || null;
}

/**
 * CONVENIENCE: Create clients from private key (server-side)
 * You can also create your own viem clients and use createNetworkClients() directly
 */
export function createClientsFromPrivateKey(
  chain: Chain,
  privateKey: Hash,
  rpcUrl?: string,
): NetworkClients {
  try {
    const account = privateKeyToAccount(privateKey);

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl || chain.rpcUrls.default.http[0]),
    });

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl || chain.rpcUrls.default.http[0]),
    });

    return createNetworkClients(publicClient, walletClient, account.address, chain.id);
  } catch (error) {
    throw new WalletError(
      `Failed to create clients from private key: ${error instanceof Error ? error.message : "Unknown error"}`,
      "CLIENT_CREATION_FAILED",
      error,
    );
  }
}

/**
 * CONVENIENCE: Create clients from browser wallet (client-side)
 * You can also create your own viem clients and use createNetworkClients() directly
 */
export async function createClientsFromBrowser(
  chain: Chain,
  rpcUrl?: string,
): Promise<NetworkClients> {
  if (!isBrowser()) {
    throw new WalletError(
      "Browser wallet connection is only available in browser environment",
      "NOT_BROWSER_ENVIRONMENT",
    );
  }

  const provider = getEthereumProvider();
  if (!provider) {
    throw new WalletError(
      "No Ethereum provider found. Please install a wallet like MetaMask.",
      "NO_PROVIDER",
    );
  }

  try {
    // Request account access
    const accounts = (await provider.request({
      method: "eth_requestAccounts",
    })) as string[];

    if (!accounts || accounts.length === 0) {
      throw new WalletError("No accounts available", "NO_ACCOUNTS");
    }

    const address = accounts[0] as Address;

    // Get current chain ID
    const chainId = (await provider.request({ method: "eth_chainId" })) as string;
    const currentChainId = parseInt(chainId, 16);

    // Check if we need to switch networks
    if (currentChainId !== chain.id) {
      await switchToNetwork(provider, chain.id);
    }

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl || chain.rpcUrls.default.http[0]),
    });

    const walletClient = createWalletClient({
      account: address,
      chain,
      transport: custom(provider),
    });

    return createNetworkClients(publicClient, walletClient, address, chain.id);
  } catch (error) {
    if (error instanceof WalletError || error instanceof NetworkError) {
      throw error;
    }
    throw new WalletError(
      `Failed to connect browser wallet: ${error instanceof Error ? error.message : "Unknown error"}`,
      "BROWSER_CONNECTION_FAILED",
      error,
    );
  }
}

/**
 * CONVENIENCE: Switch to a specific network in browser wallet
 */
export async function switchToNetwork(provider: EthereumProvider, chainId: number): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${chainId.toString(16)}` }],
    });
  } catch (error: unknown) {
    // Chain not found, try to add it
    const errorObj = error as { code?: number; message?: string };
    if (errorObj.code === 4902) {
      throw new NetworkError(
        `Network ${chainId} not found in wallet. Please add it manually.`,
        "NETWORK_NOT_FOUND",
        error,
      );
    }
    throw new NetworkError(
      `Failed to switch network: ${errorObj.message || "Unknown error"}`,
      "NETWORK_SWITCH_FAILED",
      error,
    );
  }
}

/**
 * CONVENIENCE: Add a custom network to browser wallet
 */
export async function addNetwork(
  provider: EthereumProvider,
  config: {
    chainId: number;
    name: string;
    rpcUrl: string;
    blockExplorer?: string;
  },
): Promise<void> {
  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: `0x${config.chainId.toString(16)}`,
          chainName: config.name,
          rpcUrls: [config.rpcUrl],
          blockExplorerUrls: config.blockExplorer ? [config.blockExplorer] : undefined,
          nativeCurrency: {
            name: "ETH",
            symbol: "ETH",
            decimals: 18,
          },
        },
      ],
    });
  } catch (error: unknown) {
    const errorObj = error as { message?: string };
    throw new NetworkError(
      `Failed to add network: ${errorObj.message || "Unknown error"}`,
      "NETWORK_ADD_FAILED",
      error,
    );
  }
}

/**
 * CONVENIENCE: Auto-detect environment and create clients
 * You can also create your own viem clients and use createNetworkClients() directly
 */
export async function autoCreateClients(
  chain: Chain,
  options: {
    privateKey?: Hash;
    rpcUrl?: string;
    preferBrowser?: boolean;
  } = {},
): Promise<NetworkClients> {
  const { privateKey, rpcUrl, preferBrowser = false } = options;

  // If private key is provided, use server-side approach
  if (privateKey) {
    return createClientsFromPrivateKey(chain, privateKey, rpcUrl);
  }

  // If in browser and prefer browser wallet, or no private key provided
  if (isBrowser() && (preferBrowser || !privateKey)) {
    return createClientsFromBrowser(chain, rpcUrl);
  }

  throw new WalletError(
    "No wallet connection method available. Provide a private key for server-side usage or use in browser environment.",
    "NO_CONNECTION_METHOD",
  );
}
