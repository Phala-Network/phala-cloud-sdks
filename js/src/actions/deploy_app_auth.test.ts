import { beforeEach, describe, expect, it, vi, type MockedFunction } from "vitest";
import { z } from "zod";
import { createPublicClient, createWalletClient, parseEventLogs, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { 
  deployAppAuth,
  safeDeployAppAuth,
  DeployAppAuthSchema,
  DeployAppAuthRequestSchema,
  type DeployAppAuth,
  type DeployAppAuthRequest,
} from "./deploy_app_auth";

// Mock viem modules
vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    createPublicClient: vi.fn(),
    createWalletClient: vi.fn(),
    parseEventLogs: vi.fn(),
  };
});

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: vi.fn(),
}));

// Mock utils
vi.mock("../utils", async () => {
  const actual = await vi.importActual("../utils");
  return {
    ...actual,
    validateNetworkPrerequisites: vi.fn(),
    createTransactionTracker: vi.fn(),
    executeTransactionWithRetry: vi.fn(),
  };
});

import { validateNetworkPrerequisites, createTransactionTracker, executeTransactionWithRetry } from "../utils";
const mockValidateNetworkPrerequisites = validateNetworkPrerequisites as MockedFunction<typeof validateNetworkPrerequisites>;
const mockCreateTransactionTracker = createTransactionTracker as MockedFunction<typeof createTransactionTracker>;
const mockExecuteTransactionWithRetry = executeTransactionWithRetry as MockedFunction<typeof executeTransactionWithRetry>;

const mockCreatePublicClient = createPublicClient as MockedFunction<typeof createPublicClient>;
const mockCreateWalletClient = createWalletClient as MockedFunction<typeof createWalletClient>;
const mockParseEventLogs = parseEventLogs as MockedFunction<typeof parseEventLogs>;
const mockPrivateKeyToAccount = privateKeyToAccount as MockedFunction<typeof privateKeyToAccount>;

describe("deployAppAuth", () => {
  let mockPublicClient: any;
  let mockWalletClient: any;
  let mockAccount: any;
  let mockTransactionTracker: any;

  const validRequest: DeployAppAuthRequest = {
    chain: base, // Use proper viem chain
    kmsContractAddress: "0x1234567890abcdef1234567890abcdef12345678",
    privateKey: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    deviceId: "1234567890abcdef1234567890abcdef", // This will auto-set allowAnyDevice to false
    composeHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  };

  const mockDeploymentResult: DeployAppAuth = {
    appId: "0xapp123456789abcdef123456789abcdef123456789",
    appAuthAddress: "0xauth123456789abcdef123456789abcdef12345678",
    deployer: "0xdeployer123456789abcdef123456789abcdef1234",
    transactionHash: "0x123456789abcdef123456789abcdef123456789abcdef123456789abcdef12345678" as `0x${string}`,
    blockNumber: 12345n,
    gasUsed: 500000n,
  };

  const mockReceipt = {
    transactionHash: mockDeploymentResult.transactionHash,
    blockHash: "0xblockhash123456789abcdef123456789abcdef123456789abcdef123456789abcdef" as `0x${string}`,
    blockNumber: mockDeploymentResult.blockNumber,
    contractAddress: null,
    cumulativeGasUsed: 500000n,
    effectiveGasPrice: 1000000000n,
    from: "0xdeployer123456789abcdef123456789abcdef1234" as `0x${string}`,
    gasUsed: mockDeploymentResult.gasUsed,
    logsBloom: "0x0" as `0x${string}`,
    status: "success" as const,
    to: "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`,
    transactionIndex: 0,
    type: "legacy" as const,
    logs: [
      {
        address: "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`,
        topics: ["0x123456789abcdef123456789abcdef123456789abcdef123456789abcdef12345678" as `0x${string}`],
        data: "0xdata123456789abcdef123456789abcdef123456789abcdef123456789abcdef12" as `0x${string}`,
        blockNumber: 12345n,
        transactionHash: mockDeploymentResult.transactionHash,
        transactionIndex: 0,
        blockHash: "0xblockhash123456789abcdef123456789abcdef123456789abcdef123456789abcdef" as `0x${string}`,
        logIndex: 0,
        removed: false,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock account
    mockAccount = {
      address: mockDeploymentResult.deployer,
    };
    mockPrivateKeyToAccount.mockReturnValue(mockAccount);

    // Mock public client
    mockPublicClient = {
      getBalance: vi.fn().mockResolvedValue(parseEther("1.0")), // 1 ETH balance
      getChainId: vi.fn().mockResolvedValue(base.id),
      getCode: vi.fn().mockResolvedValue("0x608060405234801561001057600080fd5b50"), // Mock contract bytecode
    };
    mockCreatePublicClient.mockReturnValue(mockPublicClient);

    // Mock wallet client
    mockWalletClient = {
      account: mockAccount,
      writeContract: vi.fn().mockResolvedValue(mockDeploymentResult.transactionHash),
      getChainId: vi.fn().mockResolvedValue(base.id),
    };
    mockCreateWalletClient.mockReturnValue(mockWalletClient);

    // Mock transaction tracker
    mockTransactionTracker = {
      status: { state: "idle" },
      isComplete: false,
      execute: vi.fn().mockResolvedValue({
        hash: mockDeploymentResult.transactionHash,
        receipt: mockReceipt as any, // Cast to any to avoid deep type issues in test
        success: true,
      }),
    };
    mockCreateTransactionTracker.mockReturnValue(mockTransactionTracker);

    // Mock executeTransactionWithRetry
    mockExecuteTransactionWithRetry.mockResolvedValue({
      hash: mockDeploymentResult.transactionHash as `0x${string}`,
      receipt: mockReceipt as any, // Cast to any to avoid deep type issues in test
      success: true,
    });

    // Mock network prerequisites validation
    mockValidateNetworkPrerequisites.mockResolvedValue({
      networkValid: true,
      balanceValid: true,
      addressValid: true,
      details: {
        currentChainId: base.id,
        balance: parseEther("1.0"),
        address: mockAccount.address,
      },
    });

    // Mock parseEventLogs
    mockParseEventLogs.mockReturnValue([
      {
        args: {
          appId: mockDeploymentResult.appId,
          proxyAddress: mockDeploymentResult.appAuthAddress,
          deployer: mockDeploymentResult.deployer,
        },
        eventName: "AppDeployedViaFactory",
        address: "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`,
        blockHash: "0xblockhash123456789abcdef123456789abcdef123456789abcdef123456789abcdef" as `0x${string}`,
        blockNumber: 12345n,
        data: "0xdata123456789abcdef123456789abcdef123456789abcdef123456789abcdef12" as `0x${string}`,
        logIndex: 0,
        transactionHash: mockDeploymentResult.transactionHash as `0x${string}`,
        transactionIndex: 0,
        removed: false,
        topics: [],
      },
    ]);
  });

  describe("Standard Version", () => {
    it("should deploy app auth contract successfully with private key", async () => {
      const result = await deployAppAuth(validRequest);

      expect(result).toEqual(mockDeploymentResult);
      expect(mockPrivateKeyToAccount).toHaveBeenCalledWith(validRequest.privateKey);
      expect(mockCreatePublicClient).toHaveBeenCalled();
      expect(mockCreateWalletClient).toHaveBeenCalled();
      expect(mockValidateNetworkPrerequisites).toHaveBeenCalled();
      expect(mockTransactionTracker.execute).toHaveBeenCalled();
      
      // Check that the tracker was called with the correct deployment operation
      const executeCall = mockTransactionTracker.execute.mock.calls[0];
      expect(executeCall[0]).toBeInstanceOf(Function); // deployment operation
      expect(executeCall[1]).toEqual(expect.any(Object)); // network clients
    });

    it("should handle optional parameters with defaults", async () => {
      const minimalRequest: DeployAppAuthRequest = {
        chain: base,
        kmsContractAddress: validRequest.kmsContractAddress,
        privateKey: validRequest.privateKey,
      };

      await deployAppAuth(minimalRequest);

      expect(mockTransactionTracker.execute).toHaveBeenCalled();
      expect(mockValidateNetworkPrerequisites).toHaveBeenCalled();
    });

    it("should handle custom wallet client mode", async () => {
      const requestWithWallet: DeployAppAuthRequest = {
        chain: base,
        kmsContractAddress: validRequest.kmsContractAddress,
        walletClient: mockWalletClient,
      };

      await deployAppAuth(requestWithWallet);

      expect(mockCreatePublicClient).toHaveBeenCalled(); // Should create public client
      expect(mockCreateWalletClient).not.toHaveBeenCalled(); // Should use provided wallet client
      expect(mockTransactionTracker.execute).toHaveBeenCalled();
    });

    it("should handle allowAnyDevice logic correctly", async () => {
      // Test 1: When deviceId is specified (non-default), allowAnyDevice should be false
      const requestWithDevice: DeployAppAuthRequest = {
        ...validRequest,
        allowAnyDevice: true, // This should be overridden to false
      };

      await deployAppAuth(requestWithDevice);
      expect(mockTransactionTracker.execute).toHaveBeenCalled();

      vi.clearAllMocks();

      // Test 2: When no specific deviceId, allowAnyDevice can be true
      const requestWithoutDevice: DeployAppAuthRequest = {
        chain: base,
        kmsContractAddress: validRequest.kmsContractAddress,
        privateKey: validRequest.privateKey,
        allowAnyDevice: true,
        // deviceId defaults to all zeros
      };

      await deployAppAuth(requestWithoutDevice);
      expect(mockTransactionTracker.execute).toHaveBeenCalled();
    });

    it("should handle enhanced transaction features", async () => {
      const onStateChange = vi.fn();
      const onSubmitted = vi.fn();
      const onConfirmed = vi.fn();

      const enhancedRequest: DeployAppAuthRequest = {
        ...validRequest,
        timeout: 180000,
        onTransactionStateChange: onStateChange,
        onTransactionSubmitted: onSubmitted,
        onTransactionConfirmed: onConfirmed,
      };

      await deployAppAuth(enhancedRequest);

      expect(mockTransactionTracker.execute).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Object),
        [],
        expect.objectContaining({
          timeout: 180000,
        })
      );
    });

    it("should handle retry options", async () => {
      const retryRequest: DeployAppAuthRequest = {
        ...validRequest,
        retryOptions: {
          maxRetries: 3,
          initialDelay: 1000,
        },
      };

      await deployAppAuth(retryRequest);

      expect(mockExecuteTransactionWithRetry).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Object),
        [],
        expect.any(Object),
        expect.objectContaining({
          maxRetries: 3,
          initialDelay: 1000,
        })
      );
    });

    it("should skip prerequisite checks when requested", async () => {
      const skipRequest: DeployAppAuthRequest = {
        ...validRequest,
        skipPrerequisiteChecks: true,
      };

      await deployAppAuth(skipRequest);

      expect(mockValidateNetworkPrerequisites).not.toHaveBeenCalled();
    });

    it("should return raw data when schema is false", async () => {
      const result = await deployAppAuth(validRequest, { schema: false });
      expect(result).toEqual(mockDeploymentResult);
    });

    it("should use custom schema when provided", async () => {
      const customSchema = z.object({
        appId: z.string(),
        appAuthAddress: z.string(),
      });

      const result = await deployAppAuth(validRequest, { schema: customSchema });

      expect(result).toEqual({
        appId: mockDeploymentResult.appId,
        appAuthAddress: mockDeploymentResult.appAuthAddress,
      });
    });
  });

  describe("Safe Version", () => {
    it("should return success result when deployment succeeds", async () => {
      const result = await safeDeployAppAuth(validRequest);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockDeploymentResult);
      }
    });

    it("should return error result when deployment fails", async () => {
      const error = new Error("Contract deployment failed");
      mockTransactionTracker.execute.mockRejectedValue(error);

      const result = await safeDeployAppAuth(validRequest);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("Contract deployment failed");
        expect(result.error.isRequestError).toBe(true);
        expect(result.error.status).toBe(500);
      }
    });

    it("should handle non-Error exceptions", async () => {
      mockTransactionTracker.execute.mockRejectedValue("String error");

      const result = await safeDeployAppAuth(validRequest);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("Unknown deployment error");
      }
    });

    it("should return raw data when schema is false", async () => {
      const result = await safeDeployAppAuth(validRequest, { schema: false });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockDeploymentResult);
      }
    });

    it("should use custom schema when provided", async () => {
      const customSchema = z.object({
        appId: z.string(),
        appAuthAddress: z.string(),
      });

      const result = await safeDeployAppAuth(validRequest, { schema: customSchema });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          appId: mockDeploymentResult.appId,
          appAuthAddress: mockDeploymentResult.appAuthAddress,
        });
      }
    });
  });

  describe("Schema Validation", () => {
    it("should validate DeployAppAuthRequestSchema", () => {
      const validData = DeployAppAuthRequestSchema.parse(validRequest);
      expect(validData).toEqual(expect.objectContaining(validRequest));
    });

    it("should reject missing required fields", () => {
      const invalidRequest = {
        // Missing kmsContractAddress
        privateKey: validRequest.privateKey,
      };

      expect(() => DeployAppAuthRequestSchema.parse(invalidRequest)).toThrow();
    });

    it("should reject when both privateKey and walletClient are provided", () => {
      const invalidRequest = {
        ...validRequest,
        walletClient: mockWalletClient, // Both privateKey and walletClient
      };

      expect(() => DeployAppAuthRequestSchema.parse(invalidRequest)).toThrow();
    });

    it("should allow extra fields in request", () => {
      const requestWithExtra = {
        ...validRequest,
        extraField: "extra-value",
      };

      const result = DeployAppAuthRequestSchema.parse(requestWithExtra);
      expect(result).toEqual(expect.objectContaining(requestWithExtra));
    });

    it("should allow extra fields in response", () => {
      const responseWithExtra = {
        ...mockDeploymentResult,
        extraField: "extra-value",
      };

      const result = DeployAppAuthSchema.parse(responseWithExtra);
      expect(result).toEqual(expect.objectContaining(responseWithExtra));
    });
  });

  describe("Type Inference", () => {
    it("should infer correct types for default schema", () => {
      type T = Awaited<ReturnType<typeof deployAppAuth>>;
      const isExpected: T extends DeployAppAuth ? true : false = true;
      expect(isExpected).toBe(true);
    });

    it("should infer correct types for unknown schema", () => {
      type T = Awaited<ReturnType<typeof deployAppAuth<false>>>;
      const isExpected: T extends unknown ? true : false = true;
      expect(isExpected).toBe(true);
    });

    it("should infer correct types for custom schema", () => {
      const customSchema = z.object({ appId: z.string() });
      type T = Awaited<ReturnType<typeof deployAppAuth<typeof customSchema>>>;
      const isExpected: T extends z.infer<typeof customSchema> ? true : false = true;
      expect(isExpected).toBe(true);
    });
  });

  describe("Safe Version Type Inference", () => {
    it("should infer correct SafeResult types for default schema", async () => {
      const result = await safeDeployAppAuth(validRequest);
      
      if (result.success) {
        type T = typeof result.data;
        const isExpected: T extends DeployAppAuth ? true : false = true;
        expect(isExpected).toBe(true);
      }
    });

    it("should infer correct SafeResult types for unknown schema", async () => {
      const result = await safeDeployAppAuth(validRequest, { schema: false });
      
      if (result.success) {
        type T = typeof result.data;
        const isExpected: T extends unknown ? true : false = true;
        expect(isExpected).toBe(true);
      }
    });

    it("should infer correct SafeResult types for custom schema", async () => {
      const customSchema = z.object({ appId: z.string() });
      const result = await safeDeployAppAuth(validRequest, { schema: customSchema });
      
      if (result.success) {
        type T = typeof result.data;
        const isExpected: T extends z.infer<typeof customSchema> ? true : false = true;
        expect(isExpected).toBe(true);
      }
    });
  });
}); 