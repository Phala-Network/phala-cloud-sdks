import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { createClient } from "../client";
import {
  commitCvmProvision,
  safeCommitCvmProvision,
  CommitCvmProvision,
  CommitCvmProvisionSchema,
  CommitCvmProvisionRequest,
} from "./commit_cvm_provision";

const mockPayload: CommitCvmProvisionRequest = {
  encrypted_env: "hex_encoded_encrypted_environment_data",
  app_id: "test-app-id",
  compose_hash: "test-compose-hash",
  kms_id: "test-kms-id",
  contract_address: "0x123456789abcdef",
  deployer_address: "0xfedcba987654321",
};

const mockCvmData: CommitCvmProvision = {
  id: 123,
  name: "test-vm",
  status: "running",
  teepod_id: 1,
  teepod: {
    id: 1,
    name: "test-teepod",
  },
  user_id: 456,
  app_id: "test-app-id",
  vm_uuid: "vm-uuid-123",
  instance_id: "instance-123",
  app_url: "https://test-app.phala.network",
  base_image: "dstack-dev-0.5.1",
  vcpu: 2,
  memory: 4096,
  disk_size: 40,
  manifest_version: 1,
  version: "1.0.0",
  runner: "docker",
  docker_compose_file: "version: '3'\nservices:\n  demo:\n    image: alpine\n",
  features: ["kms"],
  created_at: "2024-01-01T00:00:00Z",
  encrypted_env_pubkey: "test-pubkey",
  app_auth_contract_address: "0x123456789abcdef",
  deployer_address: "0xfedcba987654321",
};

describe("commitCvmProvision", () => {
  let client: ReturnType<typeof createClient>;
  let mockPost: any;
  let mockSafePost: any;

  beforeEach(() => {
    client = createClient({ apiKey: "test-api-key", baseURL: "https://api.test.com" });
    mockPost = vi.spyOn(client, "post");
    mockSafePost = vi.spyOn(client, "safePost");
  });

  describe("commitCvmProvision", () => {
    it("should return CVM data successfully", async () => {
      mockSafePost.mockResolvedValueOnce({ success: true, data: mockCvmData });
      
      const result = await commitCvmProvision(client, mockPayload);
      expect(result).toEqual(mockCvmData);
      expect(mockSafePost).toHaveBeenCalledWith("/cvms", mockPayload);
    });

    it("should validate response data with Zod schema", async () => {
      mockSafePost.mockResolvedValueOnce({ success: true, data: mockCvmData });
      
      const result = await commitCvmProvision(client, mockPayload);
      expect(CommitCvmProvisionSchema.parse(result)).toEqual(mockCvmData);
    });

    it("should handle API errors (throws)", async () => {
      mockSafePost.mockResolvedValueOnce({ 
        success: false, 
        error: { isRequestError: true, status: 422, message: "Validation error" } 
      });
      
      await expect(commitCvmProvision(client, mockPayload)).rejects.toThrow();
    });

    it("should return raw data when schema is false", async () => {
      const rawData = { foo: "bar" };
      mockSafePost.mockResolvedValueOnce({ success: true, data: rawData });
      
      const result = await commitCvmProvision(client, mockPayload, { schema: false });
      expect(result).toEqual(rawData);
    });

    it("should use custom schema when provided", async () => {
      const customSchema = z.object({ id: z.number(), name: z.string() });
      const customData = { id: 123, name: "test" };
      mockSafePost.mockResolvedValueOnce({ success: true, data: customData });
      
      const result = await commitCvmProvision(client, mockPayload, { schema: customSchema });
      expect(result).toEqual(customData);
    });

    it("should throw when custom schema validation fails", async () => {
      const customSchema = z.object({ id: z.number(), name: z.string() });
      const invalidData = { id: "not-a-number", name: "test" };
      mockSafePost.mockResolvedValueOnce({ success: true, data: invalidData });
      
      await expect(commitCvmProvision(client, mockPayload, { schema: customSchema })).rejects.toThrow();
    });
  });

  describe("safeCommitCvmProvision", () => {
    it("should return success result when API call succeeds", async () => {
      mockSafePost.mockResolvedValueOnce({ success: true, data: mockCvmData });
      
      const result = await safeCommitCvmProvision(client, mockPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockCvmData);
      }
    });

    it("should return error result when API call fails", async () => {
      mockSafePost.mockResolvedValueOnce({ 
        success: false, 
        error: { isRequestError: true, status: 422, message: "Validation error" } 
      });
      
      const result = await safeCommitCvmProvision(client, mockPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        if ("isRequestError" in result.error) {
          expect(result.error.isRequestError).toBe(true);
          expect(result.error.status).toBe(422);
        }
      }
    });

    it("should handle Zod validation errors", async () => {
      mockSafePost.mockResolvedValueOnce({ success: true, data: { invalid: "data" } });
      
      const result = await safeCommitCvmProvision(client, mockPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        if (!("isRequestError" in result.error)) {
          expect(result.error.issues).toBeDefined();
        }
      }
    });

    it("should pass through HTTP errors directly", async () => {
      mockSafePost.mockResolvedValueOnce({ 
        success: false, 
        error: { isRequestError: true, status: 400, message: "Bad request" } 
      });
      
      const result = await safeCommitCvmProvision(client, mockPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        if ("isRequestError" in result.error) {
          expect(result.error.status).toBe(400);
          expect(result.error.message).toBe("Bad request");
        }
      }
    });

    it("should return raw data when schema is false", async () => {
      const rawData = { foo: "bar" };
      mockSafePost.mockResolvedValueOnce({ success: true, data: rawData });
      
      const result = await safeCommitCvmProvision(client, mockPayload, { schema: false });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(rawData);
      }
    });

    it("should use custom schema when provided", async () => {
      const customSchema = z.object({ id: z.number(), name: z.string() });
      const customData = { id: 123, name: "test" };
      mockSafePost.mockResolvedValueOnce({ success: true, data: customData });
      
      const result = await safeCommitCvmProvision(client, mockPayload, { schema: customSchema });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(customData);
      }
    });

    it("should return validation error when custom schema fails", async () => {
      const customSchema = z.object({ id: z.number(), name: z.string() });
      const invalidData = { id: "not-a-number", name: "test" };
      mockSafePost.mockResolvedValueOnce({ success: true, data: invalidData });
      
      const result = await safeCommitCvmProvision(client, mockPayload, { schema: customSchema });
      expect(result.success).toBe(false);
      if (!result.success) {
        if (!("isRequestError" in result.error)) {
          expect(result.error.issues).toBeDefined();
        }
      }
    });
  });

  describe("parameter handling", () => {
    it("should work without parameters", async () => {
      mockSafePost.mockResolvedValueOnce({ success: true, data: mockCvmData });
      
      const result = await commitCvmProvision(client, mockPayload);
      expect(result).toEqual(mockCvmData);
    });

    it("should work with empty parameters object", async () => {
      mockSafePost.mockResolvedValueOnce({ success: true, data: mockCvmData });
      
      const result = await commitCvmProvision(client, mockPayload, {});
      expect(result).toEqual(mockCvmData);
    });

    it("should work with safe version without parameters", async () => {
      mockSafePost.mockResolvedValueOnce({ success: true, data: mockCvmData });
      
      const result = await safeCommitCvmProvision(client, mockPayload);
      expect(result.success).toBe(true);
    });

    it("should work with safe version with empty parameters object", async () => {
      mockSafePost.mockResolvedValueOnce({ success: true, data: mockCvmData });
      
      const result = await safeCommitCvmProvision(client, mockPayload, {});
      expect(result.success).toBe(true);
    });
  });

  describe("schema flexibility", () => {
    it("should allow extra fields in API response for forward compatibility", async () => {
      const responseWithExtraFields = { 
        ...mockCvmData, 
        future_field: "future_value",
        another_new_field: 42 
      };
      mockSafePost.mockResolvedValueOnce({ success: true, data: responseWithExtraFields });
      
      const result = await commitCvmProvision(client, mockPayload);
      expect(result).toEqual(responseWithExtraFields);
    });
  });

  describe("type inference", () => {
    it("should infer correct types for default schema", () => {
      type T = Awaited<ReturnType<typeof commitCvmProvision>>;
      const isExpected: T extends CommitCvmProvision ? true : false = true;
      expect(isExpected).toBe(true);
    });

    it("should infer unknown type when schema is false", () => {
      type T = Awaited<ReturnType<typeof commitCvmProvision<false>>>;
      const isExpected: T extends unknown ? true : false = true;
      expect(isExpected).toBe(true);
    });

    it("should infer correct types for custom schema", () => {
      const customSchema = z.object({ foo: z.string() });
      type T = Awaited<ReturnType<typeof commitCvmProvision<typeof customSchema>>>;
      const isExpected: T extends { foo: string } ? true : false = true;
      expect(isExpected).toBe(true);
    });
  });

  describe("safe version type inference", () => {
    it("should infer correct SafeResult types for default schema", () => {
      type T = Awaited<ReturnType<typeof safeCommitCvmProvision>>;
      const isExpected: T extends { success: boolean } ? true : false = true;
      expect(isExpected).toBe(true);
    });

    it("should infer correct SafeResult types for unknown schema", () => {
      type T = Awaited<ReturnType<typeof safeCommitCvmProvision<false>>>;
      const isExpected: T extends { success: boolean } ? true : false = true;
      expect(isExpected).toBe(true);
    });

    it("should infer correct SafeResult types for custom schema", () => {
      const customSchema = z.object({ foo: z.string() });
      type T = Awaited<ReturnType<typeof safeCommitCvmProvision<typeof customSchema>>>;
      const isExpected: T extends { success: boolean } ? true : false = true;
      expect(isExpected).toBe(true);
    });
  });
}); 