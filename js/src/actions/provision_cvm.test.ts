import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { createClient } from "../client";
import {
  provisionCvm,
  safeProvisionCvm,
  ProvisionCvm,
  ProvisionCvmSchema,
  ProvisionCvmRequest,
} from "./provision_cvm";

const mockAppCompose: ProvisionCvmRequest = {
  node_id: 1,
  name: "test-vm",
  image: "dstack-dev-0.5.1",
  vcpu: 2,
  memory: 4096,
  disk_size: 40,
  compose_file: {
    features: ["kms"],
    name: "compose-name",
  },
};

const mockProvisionData: ProvisionCvm = {
  app_id: "test-app-id",
  app_env_encrypt_pubkey: "test-pubkey",
  compose_hash: "test-hash",
  fmspc: "test-fmspc",
  device_id: "test-device",
  os_image_hash: "test-os-hash",
  node_id: 1, // Transformed from teepod_id
};

describe("provisionCvm", () => {
  let client: ReturnType<typeof createClient>;
  let mockPost: any;
  let mockSafePost: any;

  beforeEach(() => {
    client = createClient({ apiKey: "test-api-key", baseURL: "https://api.test.com" });
    mockPost = vi.spyOn(client, "post");
    mockSafePost = vi.spyOn(client, "safePost");
  });

  describe("provisionCvm", () => {
    it("should return provisioned data successfully with node_id", async () => {
      // Mock backend response with teepod_id
      const backendResponse = { ...mockProvisionData, teepod_id: 1 };
      delete (backendResponse as any).node_id;
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });
      
      const result = await provisionCvm(client, mockAppCompose);
      expect(result).toEqual(mockProvisionData); // Should have node_id, not teepod_id
      expect(result).toHaveProperty("node_id", 1);
      expect(result).not.toHaveProperty("teepod_id");
      expect(mockSafePost).toHaveBeenCalledWith(
        "/cvms/provision",
        expect.objectContaining({ teepod_id: mockAppCompose.node_id })
      );
    });

    it("should validate response data with zod schema", async () => {
      const backendResponse = { ...mockProvisionData, teepod_id: 1 };
      delete (backendResponse as any).node_id;
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });
      
      const result = await provisionCvm(client, mockAppCompose);
      expect(ProvisionCvmSchema.parse(result)).toEqual(mockProvisionData);
    });

    it("should handle API errors properly", async () => {
      mockSafePost.mockResolvedValueOnce({ success: false, error: { isRequestError: true, status: 500, message: "API error" } });
      await expect(provisionCvm(client, mockAppCompose)).rejects.toThrow();
    });

    it("should return raw data when schema is false", async () => {
      const rawData = { foo: "bar" };
      mockSafePost.mockResolvedValueOnce({ success: true, data: rawData });
      const result = await provisionCvm(client, mockAppCompose, { schema: false });
      expect(result).toEqual(rawData);
    });

    it("should use custom schema when provided", async () => {
      const customSchema = z.object({ foo: z.string() });
      const customData = { foo: "bar" };
      mockSafePost.mockResolvedValueOnce({ success: true, data: customData });
      const result = await provisionCvm(client, mockAppCompose, { schema: customSchema });
      expect(result).toEqual(customData);
    });

    it("should throw when custom schema validation fails", async () => {
      const customSchema = z.object({ foo: z.string() });
      const invalidData = { foo: 123 };
      mockSafePost.mockResolvedValueOnce({ success: true, data: invalidData });
      await expect(provisionCvm(client, mockAppCompose, { schema: customSchema })).rejects.toThrow();
    });

    it("should print warning if teepod_id is used", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const req = { ...mockAppCompose, node_id: undefined, teepod_id: 2 };
      const backendResponse = { ...mockProvisionData, teepod_id: 2 };
      delete (backendResponse as any).node_id;
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });
      await provisionCvm(client, req);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("teepod_id is deprecated")
      );
      warnSpy.mockRestore();
    });

    it("should prefer node_id over teepod_id if both are present", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const req = { ...mockAppCompose, teepod_id: 999 };
      const backendResponse = { ...mockProvisionData, teepod_id: 1 };
      delete (backendResponse as any).node_id;
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });
      await provisionCvm(client, req);
      // Should not warn, should use node_id
      expect(warnSpy).not.toHaveBeenCalled();
      expect(mockSafePost).toHaveBeenCalledWith(
        "/cvms/provision",
        expect.objectContaining({ teepod_id: mockAppCompose.node_id })
      );
      warnSpy.mockRestore();
    });
  });

  describe("safeProvisionCvm", () => {
    it("should return success result when API call succeeds", async () => {
      const backendResponse = { ...mockProvisionData, teepod_id: 1 };
      delete (backendResponse as any).node_id;
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });
      const result = await safeProvisionCvm(client, mockAppCompose);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockProvisionData);
        expect(result.data).toHaveProperty("node_id", 1);
        expect(result.data).not.toHaveProperty("teepod_id");
      }
    });

    it("should return error result when API call fails", async () => {
      mockSafePost.mockResolvedValueOnce({ success: false, error: { isRequestError: true, status: 500, message: "fail" } });
      const result = await safeProvisionCvm(client, mockAppCompose);
      expect(result.success).toBe(false);
      if (!result.success) {
        if ("isRequestError" in result.error) {
          expect(result.error.isRequestError).toBe(true);
        }
      }
    });

    it("should handle zod validation errors", async () => {
      mockSafePost.mockResolvedValueOnce({ success: true, data: { foo: "bar" } });
      const result = await safeProvisionCvm(client, mockAppCompose);
      expect(result.success).toBe(false);
      if (!result.success) {
        if (!("isRequestError" in result.error)) {
          expect(result.error.issues).toBeDefined();
        }
      }
    });

    it("should pass through HTTP errors directly", async () => {
      mockSafePost.mockResolvedValueOnce({ success: false, error: { isRequestError: true, status: 400, message: "bad request" } });
      const result = await safeProvisionCvm(client, mockAppCompose);
      expect(result.success).toBe(false);
      if (!result.success) {
        if ("isRequestError" in result.error) {
          expect(result.error.status).toBe(400);
        }
      }
    });

    it("should return raw data when schema is false", async () => {
      const rawData = { foo: "bar" };
      mockSafePost.mockResolvedValueOnce({ success: true, data: rawData });
      const result = await safeProvisionCvm(client, mockAppCompose, { schema: false });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(rawData);
      }
    });

    it("should use custom schema when provided", async () => {
      const customSchema = z.object({ foo: z.string() });
      const customData = { foo: "bar" };
      mockSafePost.mockResolvedValueOnce({ success: true, data: customData });
      const result = await safeProvisionCvm(client, mockAppCompose, { schema: customSchema });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(customData);
      }
    });

    it("should return validation error when custom schema fails", async () => {
      const customSchema = z.object({ foo: z.string() });
      mockSafePost.mockResolvedValueOnce({ success: true, data: { foo: 123 } });
      const result = await safeProvisionCvm(client, mockAppCompose, { schema: customSchema });
      expect(result.success).toBe(false);
      if (!result.success) {
        if (!("isRequestError" in result.error)) {
          expect(result.error.issues).toBeDefined();
        }
      }
    });
  });

  describe("parameter handling", () => {
    it("should work with required parameters", async () => {
      const backendResponse = { ...mockProvisionData, teepod_id: 1 };
      delete (backendResponse as any).node_id;
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });
      await expect(provisionCvm(client, mockAppCompose)).resolves.toBeDefined();
    });
    it("should work with safe version and required parameters", async () => {
      const backendResponse = { ...mockProvisionData, teepod_id: 1 };
      delete (backendResponse as any).node_id;
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });
      await expect(safeProvisionCvm(client, mockAppCompose)).resolves.toBeDefined();
    });
  });

  describe("forward compatibility", () => {
    it("should allow extra fields in API response", async () => {
      const extraData = { ...mockProvisionData, teepod_id: 1, extra_field: "extra" };
      delete (extraData as any).node_id;
      mockSafePost.mockResolvedValueOnce({ success: true, data: extraData });
      const result = await provisionCvm(client, mockAppCompose);
      expect(result).toHaveProperty("extra_field");
      expect(result).toHaveProperty("node_id", 1);
      expect(result).not.toHaveProperty("teepod_id");
    });
  });

  describe("teepod_id => node_id compatibility", () => {
    it("should transform teepod_id to node_id with default schema", async () => {
      const backendResponse = { 
        app_id: "test-app", 
        compose_hash: "test-hash", 
        teepod_id: 123 
      };
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });
      
      const result = await provisionCvm(client, mockAppCompose);
      expect(result).toHaveProperty("node_id", 123);
      expect(result).not.toHaveProperty("teepod_id");
    });

    it("should NOT transform teepod_id when schema is false", async () => {
      const backendResponse = { 
        app_id: "test-app", 
        compose_hash: "test-hash", 
        teepod_id: 123 
      };
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });
      
      const result = await provisionCvm(client, mockAppCompose, { schema: false });
      expect(result).toHaveProperty("teepod_id", 123);
      expect(result).not.toHaveProperty("node_id");
    });

    it("should NOT transform teepod_id when using custom schema", async () => {
      const customSchema = z.object({ 
        app_id: z.string(), 
        teepod_id: z.number() 
      });
      const backendResponse = { 
        app_id: "test-app", 
        teepod_id: 123 
      };
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });
      
      const result = await provisionCvm(client, mockAppCompose, { schema: customSchema });
      expect(result).toHaveProperty("teepod_id", 123);
      expect(result).not.toHaveProperty("node_id");
    });

    it("should handle response without teepod_id field gracefully", async () => {
      const backendResponse = { 
        app_id: "test-app", 
        compose_hash: "test-hash"
        // No teepod_id field
      };
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });
      
      const result = await provisionCvm(client, mockAppCompose);
      expect(result).toHaveProperty("app_id", "test-app");
      expect(result).not.toHaveProperty("teepod_id");
      expect(result).not.toHaveProperty("node_id");
    });

    it("should transform teepod_id to node_id in safeProvisionCvm with default schema", async () => {
      const backendResponse = { 
        app_id: "test-app", 
        compose_hash: "test-hash", 
        teepod_id: 456 
      };
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });
      
      const result = await safeProvisionCvm(client, mockAppCompose);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("node_id", 456);
        expect(result.data).not.toHaveProperty("teepod_id");
      }
    });

    it("should NOT transform teepod_id in safeProvisionCvm when schema is false", async () => {
      const backendResponse = { 
        app_id: "test-app", 
        compose_hash: "test-hash", 
        teepod_id: 456 
      };
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });
      
      const result = await safeProvisionCvm(client, mockAppCompose, { schema: false });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("teepod_id", 456);
        expect(result.data).not.toHaveProperty("node_id");
      }
    });
  });

  describe("tproxy_enabled => gateway_enabled compatibility", () => {
    it("should convert tproxy_enabled to gateway_enabled and show warning", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const configWithTproxy = {
        ...mockAppCompose,
        compose_file: {
          ...mockAppCompose.compose_file,
          tproxy_enabled: true,
        },
      };
      delete (configWithTproxy.compose_file as any).gateway_enabled;

      const backendResponse = { ...mockProvisionData, teepod_id: 1 };
      delete (backendResponse as any).node_id;
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });

      await provisionCvm(client, configWithTproxy);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("tproxy_enabled is deprecated")
      );
      expect(mockSafePost).toHaveBeenCalledWith(
        "/cvms/provision",
        expect.objectContaining({
          compose_file: expect.objectContaining({
            gateway_enabled: true,
          }),
        })
      );
      expect(mockSafePost).toHaveBeenCalledWith(
        "/cvms/provision",
        expect.not.objectContaining({
          compose_file: expect.objectContaining({
            tproxy_enabled: expect.anything(),
          }),
        })
      );
      warnSpy.mockRestore();
    });

    it("should prefer gateway_enabled over tproxy_enabled when both are provided", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const configWithBoth = {
        ...mockAppCompose,
        compose_file: {
          ...mockAppCompose.compose_file,
          gateway_enabled: false,
          tproxy_enabled: true,
        },
      };

      const backendResponse = { ...mockProvisionData, teepod_id: 1 };
      delete (backendResponse as any).node_id;
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });

      await provisionCvm(client, configWithBoth);

      // Should not warn when gateway_enabled is present
      expect(warnSpy).not.toHaveBeenCalled();
      expect(mockSafePost).toHaveBeenCalledWith(
        "/cvms/provision",
        expect.objectContaining({
          compose_file: expect.objectContaining({
            gateway_enabled: false,
          }),
        })
      );
      expect(mockSafePost).toHaveBeenCalledWith(
        "/cvms/provision",
        expect.not.objectContaining({
          compose_file: expect.objectContaining({
            tproxy_enabled: expect.anything(),
          }),
        })
      );
      warnSpy.mockRestore();
    });

    it("should work normally with gateway_enabled", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const configWithGateway = {
        ...mockAppCompose,
        compose_file: {
          ...mockAppCompose.compose_file,
          gateway_enabled: true,
        },
      };

      const backendResponse = { ...mockProvisionData, teepod_id: 1 };
      delete (backendResponse as any).node_id;
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });

      await provisionCvm(client, configWithGateway);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(mockSafePost).toHaveBeenCalledWith(
        "/cvms/provision",
        expect.objectContaining({
          compose_file: expect.objectContaining({
            gateway_enabled: true,
          }),
        })
      );
      warnSpy.mockRestore();
    });

    it("should handle missing compose_file gracefully", async () => {
      const configWithoutComposeFile = {
        ...mockAppCompose,
      };
      delete (configWithoutComposeFile as any).compose_file;

      const backendResponse = { ...mockProvisionData, teepod_id: 1 };
      delete (backendResponse as any).node_id;
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });

      await expect(provisionCvm(client, configWithoutComposeFile)).resolves.toBeDefined();
    });

    it("should work with safeProvisionCvm and tproxy_enabled", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const configWithTproxy = {
        ...mockAppCompose,
        compose_file: {
          ...mockAppCompose.compose_file,
          tproxy_enabled: false,
        },
      };
      delete (configWithTproxy.compose_file as any).gateway_enabled;

      const backendResponse = { ...mockProvisionData, teepod_id: 1 };
      delete (backendResponse as any).node_id;
      mockSafePost.mockResolvedValueOnce({ success: true, data: backendResponse });

      const result = await safeProvisionCvm(client, configWithTproxy);

      expect(result.success).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("tproxy_enabled is deprecated")
      );
      expect(mockSafePost).toHaveBeenCalledWith(
        "/cvms/provision",
        expect.objectContaining({
          compose_file: expect.objectContaining({
            gateway_enabled: false,
          }),
        })
      );
      warnSpy.mockRestore();
    });
  });

  describe("type inference", () => {
    it("should infer correct types for default schema", () => {
      type T = Awaited<ReturnType<typeof provisionCvm>>;
      type _Assert = T extends ProvisionCvm ? true : false;
      const isCorrect: _Assert = true;
      expect(isCorrect).toBe(true);
    });
    it("should infer correct types for custom schema", () => {
      const customSchema = z.object({ foo: z.string() });
      type T = Awaited<ReturnType<typeof provisionCvm<typeof customSchema>>>;
      type _Assert = T extends { foo: string } ? true : false;
      const isCorrect: _Assert = true;
      expect(isCorrect).toBe(true);
    });
    it("should infer SafeResult for safe version", () => {
      type T = Awaited<ReturnType<typeof safeProvisionCvm>>;
      type _Assert = T extends { success: boolean } ? true : false;
      const isCorrect: _Assert = true;
      expect(isCorrect).toBe(true);
    });
  });
}); 