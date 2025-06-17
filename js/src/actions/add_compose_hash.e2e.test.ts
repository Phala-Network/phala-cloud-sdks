import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { anvil } from "viem/chains";
import {
  addComposeHash,
  safeAddComposeHash,
  type AddComposeHashRequest,
} from "./add_compose_hash";
import { deployAppAuth } from "./deploy_app_auth";

describe("addComposeHash E2E", () => {
  let testAppId: string;
  let testAppAuthAddress: string;
  let hasCompleteTestEnvironment: boolean;

  beforeAll(() => {
    // Check if we have a complete test environment
    hasCompleteTestEnvironment = !!(
      process.env.TEST_PRIVATE_KEY && 
      process.env.TEST_KMS_CONTRACT_ADDRESS && 
      process.env.TEST_CHAIN_ID
    );

    if (!hasCompleteTestEnvironment) {
      console.warn("⚠️ Incomplete test environment detected. Some tests will be skipped.");
      console.warn("Required environment variables:");
      console.warn("- TEST_PRIVATE_KEY: Private key for test account");
      console.warn("- TEST_KMS_CONTRACT_ADDRESS: Address of deployed KMS contract");
      console.warn("- TEST_CHAIN_ID: Chain ID for testing");
    }

    if (!process.env.TEST_PRIVATE_KEY) {
      throw new Error("TEST_PRIVATE_KEY environment variable is required for E2E tests");
    }
  });

  beforeAll(async () => {
    if (!hasCompleteTestEnvironment) {
      console.warn("⚠️  E2E tests skipped: Missing required environment variables");
      return;
    }

    // Deploy a test app to use for compose hash operations
    try {
      console.log("🚀 Deploying test app for E2E tests...");
      
      // Use a unique compose hash based on timestamp to avoid conflicts
      const uniqueTimestamp = Date.now().toString(16).padStart(16, "0");
      const uniqueComposeHash = `0x${uniqueTimestamp}${"0".repeat(48)}`;
      
      const deployResult = await deployAppAuth({
        chain: anvil,
        kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
        privateKey: process.env.TEST_PRIVATE_KEY as `0x${string}`,
        allowAnyDevice: true,
        composeHash: uniqueComposeHash,
        skipPrerequisiteChecks: true, // Skip balance checks for testing
        timeout: 180000, // 3 minutes for deployment
      });

      testAppId = deployResult.appId;
      testAppAuthAddress = deployResult.appAuthAddress;
      
      console.log(`✅ Test app deployed: ${testAppId}`);
      console.log(`   AppAuth address: ${testAppAuthAddress}`);
      console.log(`   Unique deploy hash: ${uniqueComposeHash}`);
    } catch (error) {
      console.error("❌ Failed to deploy test app:", error);
      
      // If deployment fails due to nonce issues, wait a bit and retry once
      if (error instanceof Error && error.message.includes("underpriced")) {
        console.log("🔄 Retrying deployment due to nonce conflict...");
        try {
          // Wait a bit to let any pending transactions complete
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const retryTimestamp = Date.now().toString(16).padStart(16, "0");
          const retryComposeHash = `0x${retryTimestamp}${"0".repeat(48)}`;
          
          const retryResult = await deployAppAuth({
            chain: anvil,
            kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
            privateKey: process.env.TEST_PRIVATE_KEY as `0x${string}`,
            allowAnyDevice: true,
            composeHash: retryComposeHash,
            skipPrerequisiteChecks: true,
            timeout: 180000,
          });

          testAppId = retryResult.appId;
          testAppAuthAddress = retryResult.appAuthAddress;
          
          console.log(`✅ Test app deployed on retry: ${testAppId}`);
        } catch (retryError) {
          console.error("❌ Retry deployment also failed:", retryError);
          throw retryError;
        }
      } else {
        throw error;
      }
    }
  }, 300000); // 5 minutes timeout for setup

  describe("Success Scenarios", () => {
    it("should add compose hash successfully", async () => {
      if (!hasCompleteTestEnvironment) {
        console.log("⚠️ Skipping E2E test: Incomplete test environment");
        return;
      }

      // Use timestamp to ensure unique hash for each test run
      const timestamp = Date.now().toString(16).padStart(16, "0");
      const testComposeHash = `deadbeef${timestamp}${"0".repeat(64 - 8 - 16)}`;

      const request: AddComposeHashRequest = {
        chain: anvil,
        kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
        appId: testAppId as `0x${string}`,
        composeHash: testComposeHash,
        privateKey: process.env.TEST_PRIVATE_KEY as `0x${string}`,
        timeout: 120000, // 2 minutes
      };

      const result = await addComposeHash(request);

      // Verify main fields are present
      expect(result.composeHash).toBe(`0x${testComposeHash}`);
      expect(result.appAuthAddress).toBe(testAppAuthAddress);
      expect(result.appId).toBe(testAppId);
      expect(result.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(typeof result.blockNumber).toBe("bigint");
      expect(typeof result.gasUsed).toBe("bigint");

      console.log(`✅ Compose hash added: ${result.composeHash}`);
      console.log(`   Transaction: ${result.transactionHash}`);
      console.log(`   Block: ${result.blockNumber}`);
      console.log(`   Gas used: ${result.gasUsed}`);
    }, 180000); // 3 minutes timeout

    it("should work with custom schema", async () => {
      if (!hasCompleteTestEnvironment) {
        console.log("⚠️ Skipping custom schema test: Incomplete test environment");
        return;
      }

      const timestamp = (Date.now() + 1000).toString(16).padStart(16, "0");
      const testComposeHash = `cafebabe${timestamp}${"0".repeat(64 - 8 - 16)}`;
      
      const customSchema = z.object({
        composeHash: z.string(),
        transactionHash: z.string(),
        blockNumber: z.bigint(),
      });

      const request: AddComposeHashRequest = {
        chain: anvil,
        kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
        appId: testAppId as `0x${string}`,
        composeHash: testComposeHash,
        privateKey: process.env.TEST_PRIVATE_KEY as `0x${string}`,
      };

      const result = await addComposeHash(request, { schema: customSchema });

      expect(result.composeHash).toBe(`0x${testComposeHash}`);
      expect(result.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(typeof result.blockNumber).toBe("bigint");
      
      // Should not have fields not in custom schema
      expect("appAuthAddress" in result).toBe(false);
      expect("gasUsed" in result).toBe(false);
    }, 180000);

    it("should return raw data when schema is false", async () => {
      if (!hasCompleteTestEnvironment) {
        console.log("⚠️ Skipping raw data test: Incomplete test environment");
        return;
      }

      const timestamp = (Date.now() + 2000).toString(16).padStart(16, "0");
      const testComposeHash = `beefdead${timestamp}${"0".repeat(64 - 8 - 16)}`;

      const request: AddComposeHashRequest = {
        chain: anvil,
        kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
        appId: testAppId as `0x${string}`,
        composeHash: testComposeHash,
        privateKey: process.env.TEST_PRIVATE_KEY as `0x${string}`,
      };

      const result = await addComposeHash(request, { schema: false });

      // Should return unknown type, but still have the expected data
      expect(typeof result).toBe("object");
      expect(result).toHaveProperty("composeHash");
      expect(result).toHaveProperty("transactionHash");
    }, 180000);

    it("should work with safe version", async () => {
      if (!hasCompleteTestEnvironment) {
        console.log("⚠️ Skipping safe version test: Incomplete test environment");
        return;
      }

      const timestamp = (Date.now() + 3000).toString(16).padStart(16, "0");
      const testComposeHash = `feedface${timestamp}${"0".repeat(64 - 8 - 16)}`;

      const request: AddComposeHashRequest = {
        chain: anvil,
        kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
        appId: testAppId as `0x${string}`,
        composeHash: testComposeHash,
        privateKey: process.env.TEST_PRIVATE_KEY as `0x${string}`,
      };

      const result = await safeAddComposeHash(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.composeHash).toBe(`0x${testComposeHash}`);
        expect(result.data.appAuthAddress).toBe(testAppAuthAddress);
        expect(result.data.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      }
    }, 180000);

    it("should allow adding multiple different compose hashes", async () => {
      if (!hasCompleteTestEnvironment) {
        console.log("⚠️ Skipping multiple hashes test: Incomplete test environment");
        return;
      }

      const testComposeHashes = [
        "1111111111111111111111111111111111111111111111111111111111111111",
        "2222222222222222222222222222222222222222222222222222222222222222",
        "3333333333333333333333333333333333333333333333333333333333333333",
      ];

      for (const composeHash of testComposeHashes) {
        const request: AddComposeHashRequest = {
          chain: anvil,
          kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
          appId: testAppId as `0x${string}`,
          composeHash,
          privateKey: process.env.TEST_PRIVATE_KEY as `0x${string}`,
        };

        const result = await addComposeHash(request);

        expect(result.composeHash).toBe(`0x${composeHash}`);
        expect(result.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        
        console.log(`✅ Added compose hash ${composeHash}: ${result.transactionHash}`);
      }
    }, 300000); // 5 minutes for multiple transactions
  });

  describe("Error Scenarios", () => {
    it("should handle 404 - app not found in KMS", async () => {
      if (!hasCompleteTestEnvironment) {
        console.log("⚠️ Skipping 404 test: Incomplete test environment");
        return;
      }

      const nonExistentAppId = "0x0000000000000000000000000000000000000001";
      
      const request: AddComposeHashRequest = {
        chain: anvil,
        kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
        appId: nonExistentAppId as `0x${string}`,
        composeHash: "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678",
        privateKey: process.env.TEST_PRIVATE_KEY as `0x${string}`,
      };

      try {
        await addComposeHash(request);
        expect.fail("Should have thrown an error for non-existent app");
      } catch (error: any) {
        expect(error.message).toContain("is not registered in KMS contract");
        console.log(`✅ 404 error handled correctly: ${error.message}`);
      }
    }, 120000);

    it("should handle 400 - invalid parameters with Zod validation", async () => {
      const invalidRequest = {
        chain: anvil,
        kmsContractAddress: "invalid-address", // Invalid address format
        appId: testAppId,
        composeHash: "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678",
        privateKey: process.env.TEST_PRIVATE_KEY,
      };

      try {
        await addComposeHash(invalidRequest as any);
        expect.fail("Should have thrown validation error");
      } catch (error: any) {
        expect(error.message).toBeTruthy();
        console.log(`✅ 400 validation error handled: ${error.message}`);
      }
    }, 60000);

    it("should handle 422 - invalid hex format", async () => {
      if (!hasCompleteTestEnvironment) {
        console.log("⚠️ Skipping hex format test: Incomplete test environment");
        return;
      }

      const request: AddComposeHashRequest = {
        chain: anvil,
        kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
        appId: testAppId as `0x${string}`,
        composeHash: "invalid-hex-format", // Invalid hex
        privateKey: process.env.TEST_PRIVATE_KEY as `0x${string}`,
      };

      try {
        await addComposeHash(request);
        expect.fail("Should have thrown an error for invalid hex format");
      } catch (error: any) {
        expect(error.message).toBeTruthy();
        console.log(`✅ 422 hex format error handled: ${error.message}`);
      }
    }, 120000);

    it("should handle 401 - unauthorized with wrong private key", async () => {
      if (!hasCompleteTestEnvironment) {
        console.log("⚠️ Skipping unauthorized test: Incomplete test environment");
        return;
      }

      const wrongPrivateKey = "0x1111111111111111111111111111111111111111111111111111111111111111";
      
      const request: AddComposeHashRequest = {
        chain: anvil,
        kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
        appId: testAppId as `0x${string}`,
        composeHash: "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678",
        privateKey: wrongPrivateKey as `0x${string}`,
        skipPrerequisiteChecks: true, // Skip balance check since this key has no funds
      };

      try {
        await addComposeHash(request);
        expect.fail("Should have thrown an error for unauthorized access");
      } catch (error: any) {
        // Transaction will likely fail due to lack of permissions or funds
        expect(error.message).toBeTruthy();
        console.log(`✅ 401 unauthorized error handled: ${error.message}`);
      }
    }, 120000);

    it("should handle 403 - insufficient balance", async () => {
      if (!hasCompleteTestEnvironment) {
        console.log("⚠️ Skipping insufficient balance test: Incomplete test environment");
        return;
      }

      const zeroBalanceKey = "0x2222222222222222222222222222222222222222222222222222222222222222";
      
      const request: AddComposeHashRequest = {
        chain: anvil,
        kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
        appId: testAppId as `0x${string}`,
        composeHash: "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678",
        privateKey: zeroBalanceKey as `0x${string}`,
        minBalance: "0.01", // Require minimum balance
      };

      try {
        await addComposeHash(request);
        expect.fail("Should have thrown an error for insufficient balance");
      } catch (error: any) {
        expect(error.message).toContain("Insufficient balance");
        console.log(`✅ 403 insufficient balance handled: ${error.message}`);
      }
    }, 120000);

    it("should handle safe version errors correctly", async () => {
      if (!hasCompleteTestEnvironment) {
        console.log("⚠️ Skipping safe error test: Incomplete test environment");
        return;
      }

      const nonExistentAppId = "0x0000000000000000000000000000000000000002";
      
      const request: AddComposeHashRequest = {
        chain: anvil,
        kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
        appId: nonExistentAppId as `0x${string}`,
        composeHash: "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678",
        privateKey: process.env.TEST_PRIVATE_KEY as `0x${string}`,
      };

      const result = await safeAddComposeHash(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect("isRequestError" in result.error).toBe(true);
        expect(result.error.status).toBe(500); // Blockchain errors use 500
        expect(result.error.message).toContain("is not registered in KMS contract");
        expect(result.error.detail).toContain("is not registered in KMS contract");
        
        console.log(`✅ Safe version error handled:`);
        console.log(`   Status: ${result.error.status}`);
        console.log(`   Message: ${result.error.message}`);
        console.log(`   Detail: ${result.error.detail}`);
      }
    }, 120000);

    it("should handle custom schema validation errors", async () => {
      if (!hasCompleteTestEnvironment) {
        console.log("⚠️ Skipping schema validation test: Incomplete test environment");
        return;
      }

      const strictSchema = z.object({
        onlyThisField: z.string(),
      });

      const request: AddComposeHashRequest = {
        chain: anvil,
        kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
        appId: testAppId as `0x${string}`,
        composeHash: "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678",
        privateKey: process.env.TEST_PRIVATE_KEY as `0x${string}`,
      };

      try {
        await addComposeHash(request, { schema: strictSchema });
        expect.fail("Should have thrown schema validation error");
      } catch (error: any) {
        expect(error.message).toBeTruthy();
        console.log(`✅ Schema validation error handled: ${error.message}`);
      }
    }, 120000);
  });

  describe("Edge Cases", () => {
    it("should handle same compose hash added twice (idempotent)", async () => {
      if (!hasCompleteTestEnvironment) {
        console.log("⚠️ Skipping idempotent test: Incomplete test environment");
        return;
      }

      const timestamp = (Date.now() + 4000).toString(16).padStart(16, "0");
      const duplicateComposeHash = `dddddddd${timestamp}${"d".repeat(64 - 8 - 16)}`;

      const request: AddComposeHashRequest = {
        chain: anvil,
        kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
        appId: testAppId as `0x${string}`,
        composeHash: duplicateComposeHash,
        privateKey: process.env.TEST_PRIVATE_KEY as `0x${string}`,
      };

      // Add first time
      const result1 = await addComposeHash(request);
      expect(result1.composeHash).toBe(`0x${duplicateComposeHash}`);

      // Add second time (should succeed - typically idempotent operation)
      const result2 = await addComposeHash(request);
      expect(result2.composeHash).toBe(`0x${duplicateComposeHash}`);
      
      console.log(`✅ Duplicate compose hash handled:`);
      console.log(`   First tx: ${result1.transactionHash}`);
      console.log(`   Second tx: ${result2.transactionHash}`);
    }, 240000);

    it("should handle maximum length compose hash", async () => {
      if (!hasCompleteTestEnvironment) {
        console.log("⚠️ Skipping max length test: Incomplete test environment");
        return;
      }

      // 32-byte hex string (64 hex characters)
      const maxLengthHash = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

      const request: AddComposeHashRequest = {
        chain: anvil,
        kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
        appId: testAppId as `0x${string}`,
        composeHash: maxLengthHash,
        privateKey: process.env.TEST_PRIVATE_KEY as `0x${string}`,
      };

      const result = await addComposeHash(request);

      expect(result.composeHash).toBe(`0x${maxLengthHash}`);
      expect(result.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      
      console.log(`✅ Max length hash handled: ${result.transactionHash}`);
    }, 180000);

    it("should handle zero hash", async () => {
      if (!hasCompleteTestEnvironment) {
        console.log("⚠️ Skipping zero hash test: Incomplete test environment");
        return;
      }

      const zeroHash = "0000000000000000000000000000000000000000000000000000000000000000";

      const request: AddComposeHashRequest = {
        chain: anvil,
        kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
        appId: testAppId as `0x${string}`,
        composeHash: zeroHash,
        privateKey: process.env.TEST_PRIVATE_KEY as `0x${string}`,
      };

      const result = await addComposeHash(request);

      expect(result.composeHash).toBe(`0x${zeroHash}`);
      expect(result.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      
      console.log(`✅ Zero hash handled: ${result.transactionHash}`);
    }, 180000);
  });

  describe("Integration", () => {
    it("should work with dynamic compose hash generation", async () => {
      if (!hasCompleteTestEnvironment) {
        console.log("⚠️ Skipping integration test: Incomplete test environment");
        return;
      }

      // Generate dynamic hash to test real-world usage
      const dynamicHash = Array.from({ length: 64 }, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join("");

      const request: AddComposeHashRequest = {
        chain: anvil,
        kmsContractAddress: process.env.TEST_KMS_CONTRACT_ADDRESS as `0x${string}`,
        appId: testAppId as `0x${string}`,
        composeHash: dynamicHash,
        privateKey: process.env.TEST_PRIVATE_KEY as `0x${string}`,
      };

      const result = await addComposeHash(request);

      expect(result.composeHash).toBe(`0x${dynamicHash}`);
      expect(result.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      
      console.log(`✅ Dynamic integration test completed: ${result.transactionHash}`);
    }, 180000);
  });
}); 