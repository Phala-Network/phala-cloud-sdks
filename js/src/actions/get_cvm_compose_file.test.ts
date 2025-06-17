import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Client } from "../client";
import {
  getCvmComposeFile,
  safeGetCvmComposeFile,
  CvmComposeFileSchema,
  type CvmComposeFile,
  type GetCvmComposeFileParameters,
  type GetCvmComposeFileReturnType,
} from "./get_cvm_compose_file";

// Mock the client
vi.mock("../client");

describe("getCvmComposeFile", () => {
  let mockClient: Client;

  beforeEach(() => {
    mockClient = {
      safeGet: vi.fn(),
    } as unknown as Client;
  });

  const mockComposeFileResponse: CvmComposeFile = {
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

  describe("Standard version", () => {
    it("should return compose file data successfully", async () => {
      (mockClient.safeGet as any).mockResolvedValue({
        success: true,
        data: mockComposeFileResponse,
      });

      const result = await getCvmComposeFile(mockClient, { cvm_id: "cvm-123" });

      expect(mockClient.safeGet).toHaveBeenCalledWith("/cvms/cvm-123/compose_file");
      expect(result).toEqual(mockComposeFileResponse);
    });

    it("should validate response data with Zod schema", async () => {
      const invalidResponse = { invalid: "data" };
      (mockClient.safeGet as any).mockResolvedValue({
        success: true,
        data: invalidResponse,
      });

      await expect(getCvmComposeFile(mockClient, { cvm_id: "cvm-123" })).rejects.toThrow();
    });

    it("should handle API errors (throws)", async () => {
      const error = {
        isRequestError: true,
        message: "Not found",
        status: 404,
        detail: "CVM not found",
      };
      (mockClient.safeGet as any).mockResolvedValue({
        success: false,
        error,
      });

      await expect(getCvmComposeFile(mockClient, { cvm_id: "cvm-123" })).rejects.toEqual(error);
    });

    it("should return raw data when schema is false", async () => {
      const rawData = { some: "raw", data: 123 };
      (mockClient.safeGet as any).mockResolvedValue({
        success: true,
        data: rawData,
      });

      const result = await getCvmComposeFile(mockClient, { cvm_id: "cvm-123", schema: false });

      expect(result).toEqual(rawData);
    });

    it("should use custom schema when provided", async () => {
      const customSchema = z.object({ docker_compose_file: z.string() });
      const customData = { docker_compose_file: "custom data" };
      (mockClient.safeGet as any).mockResolvedValue({
        success: true,
        data: customData,
      });

      const result = await getCvmComposeFile(mockClient, { cvm_id: "cvm-123", schema: customSchema });

      expect(result).toEqual(customData);
    });

    it("should throw when custom schema validation fails", async () => {
      const customSchema = z.object({ required_field: z.string() });
      (mockClient.safeGet as any).mockResolvedValue({
        success: true,
        data: { wrong_field: "value" },
      });

      await expect(getCvmComposeFile(mockClient, { cvm_id: "cvm-123", schema: customSchema })).rejects.toThrow();
    });

    it("should throw when cvm_id is missing", async () => {
      await expect(getCvmComposeFile(mockClient, { cvm_id: "" })).rejects.toThrow("CVM ID is required");
    });
  });

  describe("Safe version", () => {
    it("should return success result when API call succeeds", async () => {
      (mockClient.safeGet as any).mockResolvedValue({
        success: true,
        data: mockComposeFileResponse,
      });

      const result = await safeGetCvmComposeFile(mockClient, { cvm_id: "cvm-123" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockComposeFileResponse);
      }
    });

    it("should return error result when API call fails", async () => {
      const error = {
        isRequestError: true,
        message: "Server error",
        status: 500,
        detail: "Internal server error",
      };
      (mockClient.safeGet as any).mockResolvedValue({
        success: false,
        error,
      });

      const result = await safeGetCvmComposeFile(mockClient, { cvm_id: "cvm-123" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual(error);
      }
    });

    it("should handle Zod validation errors", async () => {
      (mockClient.safeGet as any).mockResolvedValue({
        success: true,
        data: { invalid: "data" },
      });

      const result = await safeGetCvmComposeFile(mockClient, { cvm_id: "cvm-123" });

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
      (mockClient.safeGet as any).mockResolvedValue({
        success: false,
        error: httpError,
      });

      const result = await safeGetCvmComposeFile(mockClient, { cvm_id: "cvm-123" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual(httpError);
      }
    });

    it("should return raw data when schema is false", async () => {
      const rawData = { custom: "response" };
      (mockClient.safeGet as any).mockResolvedValue({
        success: true,
        data: rawData,
      });

      const result = await safeGetCvmComposeFile(mockClient, { cvm_id: "cvm-123", schema: false });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(rawData);
      }
    });

    it("should use custom schema when provided", async () => {
      const customSchema = z.object({ custom_field: z.string() });
      const customData = { custom_field: "value" };
      (mockClient.safeGet as any).mockResolvedValue({
        success: true,
        data: customData,
      });

      const result = await safeGetCvmComposeFile(mockClient, { cvm_id: "cvm-123", schema: customSchema });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(customData);
      }
    });

    it("should return validation error when custom schema fails", async () => {
      const customSchema = z.object({ required_field: z.string() });
      (mockClient.safeGet as any).mockResolvedValue({
        success: true,
        data: { wrong_field: "value" },
      });

      const result = await safeGetCvmComposeFile(mockClient, { cvm_id: "cvm-123", schema: customSchema });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect("issues" in result.error).toBe(true);
      }
    });

    it("should return error when cvm_id is missing", async () => {
      const result = await safeGetCvmComposeFile(mockClient, { cvm_id: "" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect("isRequestError" in result.error).toBe(true);
        expect(result.error.message).toBe("CVM ID is required");
        if ("isRequestError" in result.error && result.error.isRequestError) {
          expect(result.error.status).toBe(400);
        }
      }
    });
  });

  describe("Parameter handling", () => {
    it("should work with cvm_id parameter", async () => {
      (mockClient.safeGet as any).mockResolvedValue({
        success: true,
        data: mockComposeFileResponse,
      });

      const result = await getCvmComposeFile(mockClient, { cvm_id: "cvm-123" });

      expect(mockClient.safeGet).toHaveBeenCalledWith("/cvms/cvm-123/compose_file");
      expect(result).toEqual(mockComposeFileResponse);
    });

    it("should work with safe version with cvm_id parameter", async () => {
      (mockClient.safeGet as any).mockResolvedValue({
        success: true,
        data: mockComposeFileResponse,
      });

      const result = await safeGetCvmComposeFile(mockClient, { cvm_id: "cvm-123" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockComposeFileResponse);
      }
    });
  });

  describe("Schema flexibility", () => {
    it("should allow extra fields in API response for forward compatibility", async () => {
      const responseWithExtraFields = {
        ...mockComposeFileResponse,
        extra_field: "extra_value",
        future_feature: { nested: "data" },
      };
      (mockClient.safeGet as any).mockResolvedValue({
        success: true,
        data: responseWithExtraFields,
      });

      const result = await getCvmComposeFile(mockClient, { cvm_id: "cvm-123" });

      expect(result).toEqual(responseWithExtraFields);
    });
  });

  describe("Type inference", () => {
    it("should infer correct types for default schema", () => {
      type T = Awaited<ReturnType<typeof getCvmComposeFile>>;
      const isExpected: T extends CvmComposeFile ? true : false = true;
      expect(isExpected).toBe(true);
    });

    it("should infer correct types for custom schema", () => {
      const customSchema = z.object({ test: z.string() });
      type T = GetCvmComposeFileReturnType<typeof customSchema>;
      const isExpected: T extends { test: string } ? true : false = true;
      expect(isExpected).toBe(true);
    });

    it("should infer correct types for schema: false", () => {
      type T = GetCvmComposeFileReturnType<false>;
      const isExpected: T extends unknown ? true : false = true;
      expect(isExpected).toBe(true);
    });
  });

  describe("Safe version type inference", () => {
    it("should infer correct SafeResult types for all parameterizations", () => {
      type DefaultResult = Awaited<ReturnType<typeof safeGetCvmComposeFile>>;
      type CustomResult = Awaited<ReturnType<typeof safeGetCvmComposeFile<z.ZodObject<{ test: z.ZodString }>>>>;
      type RawResult = Awaited<ReturnType<typeof safeGetCvmComposeFile<false>>>;

      const defaultCheck: DefaultResult extends { success: boolean } ? true : false = true;
      const customCheck: CustomResult extends { success: boolean } ? true : false = true;
      const rawCheck: RawResult extends { success: boolean } ? true : false = true;

      expect(defaultCheck).toBe(true);
      expect(customCheck).toBe(true);
      expect(rawCheck).toBe(true);
    });
  });
}); 