import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Client } from "../client";
import {
  provisionCvmComposeFileUpdate,
  safeProvisionCvmComposeFileUpdate,
  ProvisionCvmComposeFileUpdateSchema,
  type ProvisionCvmComposeFileUpdate,
  type ProvisionCvmComposeFileUpdateRequest,
  type ProvisionCvmComposeFileUpdateParameters,
  type ProvisionCvmComposeFileUpdateReturnType,
} from "./provision_cvm_compose_file_update";

// Mock the client
vi.mock("../client");

describe("provisionCvmComposeFileUpdate", () => {
  let mockClient: Client;

  beforeEach(() => {
    mockClient = {
      safePost: vi.fn(),
    } as unknown as Client;
  });

  const mockProvisionRequest: ProvisionCvmComposeFileUpdateRequest = {
    docker_compose_file: "version: '3.8'\nservices:\n  app:\n    image: nginx",
    allowed_envs: ["API_KEY", "DATABASE_URL"],
    features: ["kms"],
    name: "test-app",
    manifest_version: 1,
    kms_enabled: true,
    public_logs: false,
    public_sysinfo: false,
    tproxy_enabled: true,
    pre_launch_script: "#!/bin/bash\necho 'Starting app'",
    docker_config: {
      url: "https://registry.example.com",
      username: "user",
      password: "pass",
    },
  };

  const mockProvisionResponse: ProvisionCvmComposeFileUpdate = {
    app_id: "app-123",
    device_id: "device-456",
    compose_hash: "abc123def456",
    kms_info: {
      chain_id: 1,
      kms_url: "https://kms.example.com",
      kms_contract_address: "0x1234567890abcdef",
    },
  };

  describe("Standard version", () => {
    it("should return provision data successfully", async () => {
      (mockClient.safePost as any).mockResolvedValue({
        success: true,
        data: mockProvisionResponse,
      });

      const result = await provisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockProvisionRequest,
      });

      expect(mockClient.safePost).toHaveBeenCalledWith("/cvms/cvm-123/compose_file/provision", mockProvisionRequest);
      expect(result).toEqual(mockProvisionResponse);
    });

    it("should validate response data with Zod schema", async () => {
      const invalidResponse = { invalid: "data" };
      (mockClient.safePost as any).mockResolvedValue({
        success: true,
        data: invalidResponse,
      });

      await expect(provisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockProvisionRequest,
      })).rejects.toThrow();
    });

    it("should handle API errors (throws)", async () => {
      const error = {
        isRequestError: true,
        message: "Bad request",
        status: 400,
        detail: "Docker compose file is invalid",
      };
      (mockClient.safePost as any).mockResolvedValue({
        success: false,
        error,
      });

      await expect(provisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockProvisionRequest,
      })).rejects.toEqual(error);
    });

    it("should return raw data when schema is false", async () => {
      const rawData = { some: "raw", data: 123 };
      (mockClient.safePost as any).mockResolvedValue({
        success: true,
        data: rawData,
      });

      const result = await provisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockProvisionRequest,
        schema: false,
      });

      expect(result).toEqual(rawData);
    });

    it("should use custom schema when provided", async () => {
      const customSchema = z.object({ compose_hash: z.string() });
      const customData = { compose_hash: "custom-hash" };
      (mockClient.safePost as any).mockResolvedValue({
        success: true,
        data: customData,
      });

      const result = await provisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockProvisionRequest,
        schema: customSchema,
      });

      expect(result).toEqual(customData);
    });

    it("should throw when custom schema validation fails", async () => {
      const customSchema = z.object({ required_field: z.string() });
      (mockClient.safePost as any).mockResolvedValue({
        success: true,
        data: { wrong_field: "value" },
      });

      await expect(provisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockProvisionRequest,
        schema: customSchema,
      })).rejects.toThrow();
    });

    it("should throw when cvm_id is missing", async () => {
      await expect(provisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "",
        request: mockProvisionRequest,
      })).rejects.toThrow("CVM ID is required");
    });

    it("should throw when docker_compose_file is missing", async () => {
      const invalidRequest = { ...mockProvisionRequest, docker_compose_file: "" };
      
      await expect(provisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: invalidRequest,
      })).rejects.toThrow("Docker compose file is required");
    });
  });

  describe("Safe version", () => {
    it("should return success result when API call succeeds", async () => {
      (mockClient.safePost as any).mockResolvedValue({
        success: true,
        data: mockProvisionResponse,
      });

      const result = await safeProvisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockProvisionRequest,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockProvisionResponse);
      }
    });

    it("should return error result when API call fails", async () => {
      const error = {
        isRequestError: true,
        message: "Server error",
        status: 500,
        detail: "Internal server error",
      };
      (mockClient.safePost as any).mockResolvedValue({
        success: false,
        error,
      });

      const result = await safeProvisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockProvisionRequest,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual(error);
      }
    });

    it("should handle Zod validation errors", async () => {
      (mockClient.safePost as any).mockResolvedValue({
        success: true,
        data: { invalid: "data" },
      });

      const result = await safeProvisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockProvisionRequest,
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
      (mockClient.safePost as any).mockResolvedValue({
        success: false,
        error: httpError,
      });

      const result = await safeProvisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockProvisionRequest,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual(httpError);
      }
    });

    it("should return raw data when schema is false", async () => {
      const rawData = { custom: "response" };
      (mockClient.safePost as any).mockResolvedValue({
        success: true,
        data: rawData,
      });

      const result = await safeProvisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockProvisionRequest,
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
      (mockClient.safePost as any).mockResolvedValue({
        success: true,
        data: customData,
      });

      const result = await safeProvisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockProvisionRequest,
        schema: customSchema,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(customData);
      }
    });

    it("should return validation error when custom schema fails", async () => {
      const customSchema = z.object({ required_field: z.string() });
      (mockClient.safePost as any).mockResolvedValue({
        success: true,
        data: { wrong_field: "value" },
      });

      const result = await safeProvisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockProvisionRequest,
        schema: customSchema,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect("issues" in result.error).toBe(true);
      }
    });

    it("should return error when cvm_id is missing", async () => {
      const result = await safeProvisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "",
        request: mockProvisionRequest,
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

    it("should return error when docker_compose_file is missing", async () => {
      const invalidRequest = { ...mockProvisionRequest, docker_compose_file: "" };
      
      const result = await safeProvisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: invalidRequest,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect("isRequestError" in result.error).toBe(true);
        expect(result.error.message).toBe("Docker compose file is required");
        if ("isRequestError" in result.error && result.error.isRequestError) {
          expect(result.error.status).toBe(400);
        }
      }
    });
  });

  describe("Parameter handling", () => {
    it("should work with cvm_id and request parameters", async () => {
      (mockClient.safePost as any).mockResolvedValue({
        success: true,
        data: mockProvisionResponse,
      });

      const result = await provisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockProvisionRequest,
      });

      expect(mockClient.safePost).toHaveBeenCalledWith("/cvms/cvm-123/compose_file/provision", mockProvisionRequest);
      expect(result).toEqual(mockProvisionResponse);
    });

    it("should work with safe version with parameters", async () => {
      (mockClient.safePost as any).mockResolvedValue({
        success: true,
        data: mockProvisionResponse,
      });

      const result = await safeProvisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockProvisionRequest,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockProvisionResponse);
      }
    });
  });

  describe("Schema flexibility", () => {
    it("should allow extra fields in API response for forward compatibility", async () => {
      const responseWithExtraFields = {
        ...mockProvisionResponse,
        extra_field: "extra_value",
        future_feature: { nested: "data" },
      };
      (mockClient.safePost as any).mockResolvedValue({
        success: true,
        data: responseWithExtraFields,
      });

      const result = await provisionCvmComposeFileUpdate(mockClient, {
        cvm_id: "cvm-123",
        request: mockProvisionRequest,
      });

      expect(result).toEqual(responseWithExtraFields);
    });
  });

  describe("Type inference", () => {
    it("should infer correct types for default schema", () => {
      type T = Awaited<ReturnType<typeof provisionCvmComposeFileUpdate>>;
      const isExpected: T extends ProvisionCvmComposeFileUpdate ? true : false = true;
      expect(isExpected).toBe(true);
    });

    it("should infer correct types for custom schema", () => {
      const customSchema = z.object({ test: z.string() });
      type T = ProvisionCvmComposeFileUpdateReturnType<typeof customSchema>;
      const isExpected: T extends { test: string } ? true : false = true;
      expect(isExpected).toBe(true);
    });

    it("should infer correct types for schema: false", () => {
      type T = ProvisionCvmComposeFileUpdateReturnType<false>;
      const isExpected: T extends unknown ? true : false = true;
      expect(isExpected).toBe(true);
    });
  });

  describe("Safe version type inference", () => {
    it("should infer correct SafeResult types for all parameterizations", () => {
      type DefaultResult = Awaited<ReturnType<typeof safeProvisionCvmComposeFileUpdate>>;
      type CustomResult = Awaited<ReturnType<typeof safeProvisionCvmComposeFileUpdate<z.ZodObject<{ test: z.ZodString }>>>>;
      type RawResult = Awaited<ReturnType<typeof safeProvisionCvmComposeFileUpdate<false>>>;

      const defaultCheck: DefaultResult extends { success: boolean } ? true : false = true;
      const customCheck: CustomResult extends { success: boolean } ? true : false = true;
      const rawCheck: RawResult extends { success: boolean } ? true : false = true;

      expect(defaultCheck).toBe(true);
      expect(customCheck).toBe(true);
      expect(rawCheck).toBe(true);
    });
  });
}); 