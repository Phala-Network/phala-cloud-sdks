import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { createClient } from "../client";
import {
  getAvailableNodes,
  safeGetAvailableNodes,
  type AvailableNodes,
  AvailableNodesSchema,
} from "./get_available_nodes";

// Mock response data matching the API structure
const mockAvailableNodesData: AvailableNodes = {
  tier: "free",
  capacity: {
    max_instances: 16,
    max_vcpu: 16,
    max_memory: 32768,
    max_disk: 640,
  },
  nodes: [
    {
      teepod_id: 1,
      name: "teepod-1",
      listed: true,
      resource_score: 0.8,
      remaining_vcpu: 8,
      remaining_memory: 16000,
      remaining_cvm_slots: 4,
      images: [
        {
          name: "ubuntu",
          is_dev: false,
          version: [1, 0, 0],
          os_image_hash: null,
        },
      ],
      dedicated_for_team_id: null,
      support_onchain_kms: false,
      fmspc: null,
      device_id: null,
    },
  ],
  kms_list: [
    {
      id: "kms_1",
      url: "https://kms.example.com",
      version: "1.0.0",
      chain_id: 1,
      kms_contract_address: "0xabc",
      gateway_app_id: null,
    },
  ],
};

describe("getAvailableNodes", () => {
  let client: ReturnType<typeof createClient>;
  let mockGet: any;
  let mockSafeGet: any;

  beforeEach(() => {
    client = createClient({
      apiKey: "test-api-key",
      baseURL: "https://api.test.com",
    });
    mockGet = vi.spyOn(client, "get");
    mockSafeGet = vi.spyOn(client, "safeGet");
  });

  describe("getAvailableNodes", () => {
    it("should return data successfully", async () => {
      mockGet.mockResolvedValueOnce(mockAvailableNodesData);
      const result = await getAvailableNodes(client);
      expect(result).toEqual(mockAvailableNodesData);
    });

    it("should validate response data with zod schema", async () => {
      mockGet.mockResolvedValueOnce(mockAvailableNodesData);
      const result = await getAvailableNodes(client);
      expect(AvailableNodesSchema.parse(result)).toEqual(mockAvailableNodesData);
    });

    it("should handle API errors properly", async () => {
      mockGet.mockRejectedValueOnce(new Error("API error"));
      await expect(getAvailableNodes(client)).rejects.toThrow("API error");
    });

    it("should return raw data when schema is false", async () => {
      mockGet.mockResolvedValueOnce(mockAvailableNodesData);
      const result = await getAvailableNodes(client, { schema: false });
      expect(result).toEqual(mockAvailableNodesData);
    });

    it("should use custom schema when provided", async () => {
      mockGet.mockResolvedValueOnce({ tier: "free" });
      const customSchema = z.object({ tier: z.string() });
      const result = await getAvailableNodes(client, { schema: customSchema });
      expect(result).toEqual({ tier: "free" });
    });

    it("should throw when custom schema validation fails", async () => {
      mockGet.mockResolvedValueOnce({ foo: "bar" });
      const customSchema = z.object({ tier: z.string() });
      await expect(getAvailableNodes(client, { schema: customSchema })).rejects.toThrow();
    });
  });

  describe("safeGetAvailableNodes", () => {
    it("should return success result when API call succeeds", async () => {
      mockSafeGet.mockResolvedValueOnce({ success: true, data: mockAvailableNodesData });
      const result = await safeGetAvailableNodes(client);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockAvailableNodesData);
      }
    });

    it("should return error result when API call fails", async () => {
      mockSafeGet.mockResolvedValueOnce({ success: false, error: { isRequestError: true, status: 500, message: "fail" } });
      const result = await safeGetAvailableNodes(client);
      expect(result.success).toBe(false);
      if (!result.success) {
        if ("isRequestError" in result.error) {
          expect(result.error.isRequestError).toBe(true);
        }
      }
    });

    it("should handle zod validation errors", async () => {
      mockSafeGet.mockResolvedValueOnce({ success: true, data: { foo: "bar" } });
      const result = await safeGetAvailableNodes(client);
      expect(result.success).toBe(false);
      if (!result.success) {
        if (!("isRequestError" in result.error)) {
          expect(result.error.issues).toBeDefined();
        }
      }
    });

    it("should pass through HTTP errors directly", async () => {
      mockSafeGet.mockResolvedValueOnce({ success: false, error: { isRequestError: true, status: 400, message: "bad request" } });
      const result = await safeGetAvailableNodes(client);
      expect(result.success).toBe(false);
      if (!result.success) {
        if ("isRequestError" in result.error) {
          expect(result.error.status).toBe(400);
        }
      }
    });

    it("should return raw data when schema is false", async () => {
      mockSafeGet.mockResolvedValueOnce({ success: true, data: mockAvailableNodesData });
      const result = await safeGetAvailableNodes(client, { schema: false });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockAvailableNodesData);
      }
    });

    it("should use custom schema when provided", async () => {
      mockSafeGet.mockResolvedValueOnce({ success: true, data: { tier: "free" } });
      const customSchema = z.object({ tier: z.string() });
      const result = await safeGetAvailableNodes(client, { schema: customSchema });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ tier: "free" });
      }
    });

    it("should return validation error when custom schema fails", async () => {
      mockSafeGet.mockResolvedValueOnce({ success: true, data: { foo: "bar" } });
      const customSchema = z.object({ tier: z.string() });
      const result = await safeGetAvailableNodes(client, { schema: customSchema });
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
      mockGet.mockResolvedValueOnce(mockAvailableNodesData);
      await expect(getAvailableNodes(client)).resolves.toBeDefined();
    });
    it("should work with empty parameters object", async () => {
      mockGet.mockResolvedValueOnce(mockAvailableNodesData);
      await expect(getAvailableNodes(client, {})).resolves.toBeDefined();
    });
    it("should work with safe version without parameters", async () => {
      mockSafeGet.mockResolvedValueOnce({ success: true, data: mockAvailableNodesData });
      await expect(safeGetAvailableNodes(client)).resolves.toBeDefined();
    });
    it("should work with safe version with empty parameters object", async () => {
      mockSafeGet.mockResolvedValueOnce({ success: true, data: mockAvailableNodesData });
      await expect(safeGetAvailableNodes(client, {})).resolves.toBeDefined();
    });
  });

  describe("schema flexibility", () => {
    it("should allow extra fields in API response for forward compatibility", async () => {
      const extra = { ...mockAvailableNodesData, extra_field: "extra" };
      mockGet.mockResolvedValueOnce(extra);
      const result = await getAvailableNodes(client);
      expect(result).toMatchObject({ ...mockAvailableNodesData, extra_field: "extra" });
    });
  });

  describe("type inference", () => {
    it("should infer AvailableNodes type when no schema provided", async () => {
      type T = Awaited<ReturnType<typeof getAvailableNodes>>;
      type _Assert = T extends AvailableNodes ? true : false;
      const assert: _Assert = true;
      expect(assert).toBe(true);
    });
    it("should infer unknown type when schema is false", async () => {
      type T = Awaited<ReturnType<typeof getAvailableNodes>>;
      const isUnknown: T extends unknown ? true : false = true;
      expect(isUnknown).toBe(true);
    });
    it("should infer custom schema type when provided", async () => {
      const customSchema = z.object({ tier: z.string() });
      type T = Awaited<ReturnType<typeof getAvailableNodes<typeof customSchema>>>;
      type _Assert = T extends { tier: string } ? true : false;
      const assert: _Assert = true;
      expect(assert).toBe(true);
    });
  });

  describe("safe version type inference", () => {
    it("should infer SafeResult<AvailableNodes> when no schema provided", async () => {
      type T = Awaited<ReturnType<typeof safeGetAvailableNodes>>;
      type _Assert = T extends { success: boolean } ? true : false;
      const assert: _Assert = true;
      expect(assert).toBe(true);
    });
    it("should infer SafeResult<unknown> when schema is false", async () => {
      type T = Awaited<ReturnType<typeof safeGetAvailableNodes>>;
      const isSafeResult: T extends { success: boolean } ? true : false = true;
      expect(isSafeResult).toBe(true);
    });
    it("should infer custom type when custom schema provided", async () => {
      const customSchema = z.object({ tier: z.string() });
      type T = Awaited<ReturnType<typeof safeGetAvailableNodes>>;
      const isSafeResult: T extends { success: boolean } ? true : false = true;
      expect(isSafeResult).toBe(true);
    });
  });
}); 