import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Client } from "../client";
import {
  commitCvmComposeFileUpdate,
  safeCommitCvmComposeFileUpdate,
  CommitCvmComposeFileUpdateSchema,
  type CommitCvmComposeFileUpdate,
  type CommitCvmComposeFileUpdateRequest,
  type CommitCvmComposeFileUpdateParameters,
  type CommitCvmComposeFileUpdateReturnType,
} from "./commit_cvm_compose_file_update";

// Mock the client
vi.mock("../client");

describe("commitCvmComposeFileUpdate", () => {
  let mockClient: Client;

  beforeEach(() => {
    mockClient = {
      safePatch: vi.fn(),
    } as unknown as Client;
  });

  const mockCommitRequest: CommitCvmComposeFileUpdateRequest = {
    compose_hash: "abc123def456",
    encrypted_env: "deadbeef1234567890abcdef1234567890abcdef",
    env_keys: ["API_KEY", "DATABASE_URL"],
  };

  // HTTP 202 Accepted response (void/no response body)
  const mockCommitResponse = undefined;

  describe("Standard version", () => {
    it("should commit compose file update successfully", async () => {
      (mockClient.safePatch as any).mockResolvedValue({
        success: true,
        data: mockCommitResponse,
      });

      const result = await commitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockCommitRequest,
      });

      expect(mockClient.safePatch).toHaveBeenCalledWith("/cvms/cvm-123/compose_file", mockCommitRequest);
      expect(result).toBeUndefined(); // void response
    });

    it("should validate response data with Zod schema", async () => {
      const invalidResponse = { unexpected: "data" };
      (mockClient.safePatch as any).mockResolvedValue({
        success: true,
        data: invalidResponse,
      });

      // Void schema should handle any response gracefully
      const result = await commitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockCommitRequest,
      });

      expect(result).toBeUndefined();
    });

    it("should handle API errors (throws)", async () => {
      const error = {
        isRequestError: true,
        message: "Bad request",
        status: 400,
        detail: "Compose file not found",
      };
      (mockClient.safePatch as any).mockResolvedValue({
        success: false,
        error,
      });

      await expect(commitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockCommitRequest,
      })).rejects.toEqual(error);
    });

    it("should return raw data when schema is false", async () => {
      const rawData = { some: "raw", data: 123 };
      (mockClient.safePatch as any).mockResolvedValue({
        success: true,
        data: rawData,
      });

      const result = await commitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockCommitRequest,
        schema: false,
      });

      expect(result).toEqual(rawData);
    });

    it("should use custom schema when provided", async () => {
      const customSchema = z.object({ status: z.string() });
      const customData = { status: "accepted" };
      (mockClient.safePatch as any).mockResolvedValue({
        success: true,
        data: customData,
      });

      const result = await commitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockCommitRequest,
        schema: customSchema,
      });

      expect(result).toEqual(customData);
    });

    it("should throw when custom schema validation fails", async () => {
      const customSchema = z.object({ required_field: z.string() });
      (mockClient.safePatch as any).mockResolvedValue({
        success: true,
        data: { wrong_field: "value" },
      });

      await expect(commitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockCommitRequest,
        schema: customSchema,
      })).rejects.toThrow();
    });

    it("should throw when cvm_id is missing", async () => {
      await expect(commitCvmComposeFileUpdate(mockClient, {
        cvm_id: "",
        request: mockCommitRequest,
      })).rejects.toThrow("CVM ID is required");
    });

    it("should throw when compose_hash is missing", async () => {
      const invalidRequest = { ...mockCommitRequest, compose_hash: "" };
      
      await expect(commitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: invalidRequest,
      })).rejects.toThrow("Compose hash is required");
    });
  });

  describe("Safe version", () => {
    it("should return success result when API call succeeds", async () => {
      (mockClient.safePatch as any).mockResolvedValue({
        success: true,
        data: mockCommitResponse,
      });

      const result = await safeCommitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockCommitRequest,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeUndefined(); // void response
      }
    });

    it("should return error result when API call fails", async () => {
      const error = {
        isRequestError: true,
        message: "Server error",
        status: 500,
        detail: "Internal server error",
      };
      (mockClient.safePatch as any).mockResolvedValue({
        success: false,
        error,
      });

      const result = await safeCommitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockCommitRequest,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual(error);
      }
    });

    it("should handle Zod validation errors", async () => {
      const customSchema = z.object({ required: z.string() });
      (mockClient.safePatch as any).mockResolvedValue({
        success: true,
        data: { invalid: "data" },
      });

      const result = await safeCommitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockCommitRequest,
        schema: customSchema,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect("issues" in result.error).toBe(true);
      }
    });

    it("should pass through HTTP errors directly", async () => {
      const httpError = {
        isRequestError: true,
        message: "Unauthorized",
        status: 401,
        detail: "Invalid API key",
      };
      (mockClient.safePatch as any).mockResolvedValue({
        success: false,
        error: httpError,
      });

      const result = await safeCommitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockCommitRequest,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual(httpError);
      }
    });

    it("should return raw data when schema is false", async () => {
      const rawData = { custom: "response" };
      (mockClient.safePatch as any).mockResolvedValue({
        success: true,
        data: rawData,
      });

      const result = await safeCommitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockCommitRequest,
        schema: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(rawData);
      }
    });

    it("should use custom schema when provided", async () => {
      const customSchema = z.object({ custom_field: z.string() });
      const customData = { custom_field: "value" };
      (mockClient.safePatch as any).mockResolvedValue({
        success: true,
        data: customData,
      });

      const result = await safeCommitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockCommitRequest,
        schema: customSchema,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(customData);
      }
    });

    it("should return validation error when custom schema fails", async () => {
      const customSchema = z.object({ required_field: z.string() });
      (mockClient.safePatch as any).mockResolvedValue({
        success: true,
        data: { wrong_field: "value" },
      });

      const result = await safeCommitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockCommitRequest,
        schema: customSchema,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect("issues" in result.error).toBe(true);
      }
    });

    it("should return error when cvm_id is missing", async () => {
      const result = await safeCommitCvmComposeFileUpdate(mockClient, {
        cvm_id: "",
        request: mockCommitRequest,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect("isRequestError" in result.error).toBe(true);
        expect(result.error.message).toBe("CVM ID is required");
        if ("isRequestError" in result.error && result.error.isRequestError) {
          expect(result.error.status).toBe(400);
        }
      }
    });

    it("should return error when compose_hash is missing", async () => {
      const invalidRequest = { ...mockCommitRequest, compose_hash: "" };
      
      const result = await safeCommitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: invalidRequest,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect("isRequestError" in result.error).toBe(true);
        expect(result.error.message).toBe("Compose hash is required");
        if ("isRequestError" in result.error && result.error.isRequestError) {
          expect(result.error.status).toBe(400);
        }
      }
    });
  });

  describe("Parameter handling", () => {
    it("should work with cvm_id and request parameters", async () => {
      (mockClient.safePatch as any).mockResolvedValue({
        success: true,
        data: mockCommitResponse,
      });

      const result = await commitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockCommitRequest,
      });

      expect(mockClient.safePatch).toHaveBeenCalledWith("/cvms/cvm-123/compose_file", mockCommitRequest);
      expect(result).toBeUndefined();
    });

    it("should work with safe version with parameters", async () => {
      (mockClient.safePatch as any).mockResolvedValue({
        success: true,
        data: mockCommitResponse,
      });

      const result = await safeCommitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockCommitRequest,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeUndefined();
      }
    });
  });

  describe("Schema flexibility", () => {
    it("should allow extra fields in API response for forward compatibility", async () => {
      const responseWithExtraFields = {
        extra_field: "extra_value",
        future_feature: { nested: "data" },
      };
      (mockClient.safePatch as any).mockResolvedValue({
        success: true,
        data: responseWithExtraFields,
      });

      // Void schema should handle any response gracefully
      const result = await commitCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockCommitRequest,
      });

      expect(result).toBeUndefined();
    });
  });

  describe("Type inference", () => {
    it("should infer correct types for default schema", () => {
      type T = Awaited<ReturnType<typeof commitCvmComposeFileUpdate>>;
      const isExpected: T extends CommitCvmComposeFileUpdate ? true : false = true;
      expect(isExpected).toBe(true);
    });

    it("should infer correct types for custom schema", () => {
      const customSchema = z.object({ test: z.string() });
      type T = CommitCvmComposeFileUpdateReturnType<typeof customSchema>;
      const isExpected: T extends { test: string } ? true : false = true;
      expect(isExpected).toBe(true);
    });

    it("should infer correct types for schema: false", () => {
      type T = CommitCvmComposeFileUpdateReturnType<false>;
      const isExpected: T extends unknown ? true : false = true;
      expect(isExpected).toBe(true);
    });
  });

  describe("Safe version type inference", () => {
    it("should infer correct SafeResult types for all parameterizations", () => {
      type DefaultResult = Awaited<ReturnType<typeof safeCommitCvmComposeFileUpdate>>;
      type CustomResult = Awaited<ReturnType<typeof safeCommitCvmComposeFileUpdate<z.ZodObject<{ test: z.ZodString }>>>>;
      type RawResult = Awaited<ReturnType<typeof safeCommitCvmComposeFileUpdate<false>>>;

      const defaultCheck: DefaultResult extends { success: boolean } ? true : false = true;
      const customCheck: CustomResult extends { success: boolean } ? true : false = true;
      const rawCheck: RawResult extends { success: boolean } ? true : false = true;

      expect(defaultCheck).toBe(true);
      expect(customCheck).toBe(true);
      expect(rawCheck).toBe(true);
    });
  });
}); 