import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { createClient } from "../client";
import { getCurrentUser, safeGetCurrentUser, type CurrentUser } from "./get_current_user";

// Mock response data matching the API structure
const mockUserData: CurrentUser = {
  username: "testuser",
  email: "testuser@phala.network",
  credits: 1000,
  granted_credits: 500,
  avatar: "/default-avatar.png",
  team_name: "Test Team",
  team_tier: "pro",
};

describe("getCurrentUser", () => {
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

  describe("getCurrentUser", () => {
    it("should return current user data successfully", async () => {
      // Mock the client.get method
      const mockGet = vi.spyOn(client, "get").mockResolvedValue(mockUserData);

      const result = await getCurrentUser(client);

      expect(mockGet).toHaveBeenCalledWith("/auth/me");
      expect(result).toEqual(mockUserData);
      expect((result as CurrentUser).username).toBe("testuser");
      expect((result as CurrentUser).credits).toBe(1000);
    });

    it("should validate response data with zod schema", async () => {
      const invalidData = {
        username: "testuser",
        email: "testuser@phala.network",
        credits: "invalid", // should be number
        // missing required fields
      };

      vi.spyOn(client, "get").mockResolvedValue(invalidData);

      await expect(getCurrentUser(client)).rejects.toThrow();
    });

    it("should handle API errors properly", async () => {
      const apiError = new Error("API Error");
      vi.spyOn(client, "get").mockRejectedValue(apiError);

      await expect(getCurrentUser(client)).rejects.toThrow("API Error");
    });

    it("should return raw data when schema is false", async () => {
      const rawData = { some: "raw", data: 123 };
      vi.spyOn(client, "get").mockResolvedValue(rawData);

      const result = await getCurrentUser(client, { schema: false });

      expect(result).toEqual(rawData);
    });

    it("should use custom schema when provided", async () => {
      const customSchema = z.object({
        id: z.number(),
        name: z.string(),
      });
      const customData = { id: 1, name: "test" };
      
      vi.spyOn(client, "get").mockResolvedValue(customData);

      const result = await getCurrentUser(client, { schema: customSchema });

      expect(result).toEqual(customData);
    });

    it("should throw when custom schema validation fails", async () => {
      const customSchema = z.object({
        id: z.number(),
        name: z.string(),
      });
      const invalidData = { id: "invalid", name: 123 };
      
      vi.spyOn(client, "get").mockResolvedValue(invalidData);

      await expect(getCurrentUser(client, { schema: customSchema })).rejects.toThrow();
    });
  });

  describe("safeGetCurrentUser", () => {
    it("should return success result when API call succeeds", async () => {
      vi.spyOn(client, "safeGet").mockResolvedValue({
        success: true,
        data: mockUserData,
      });

      const result = await safeGetCurrentUser(client);

      expect(client.safeGet).toHaveBeenCalledWith("/auth/me");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockUserData);
        expect((result.data as CurrentUser).username).toBe("testuser");
      }
    });

    it("should return error result when API call fails", async () => {
      const apiError = {
        success: false,
        error: {
          name: "RequestError",
          message: "Network Error",
          detail: "Network Error",
          isRequestError: true,
        },
      } as const;

      vi.spyOn(client, "safeGet").mockResolvedValue(apiError);

      const result = await safeGetCurrentUser(client);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("Network Error");
        if ("isRequestError" in result.error) {
          expect(result.error.isRequestError).toBe(true);
        }
      }
    });

    it("should handle zod validation errors", async () => {
      const invalidData = {
        username: 123, // should be string
        email: "testuser@phala.network",
      };

      vi.spyOn(client, "safeGet").mockResolvedValue({
        success: true,
        data: invalidData,
      });

      const result = await safeGetCurrentUser(client);

      expect(result.success).toBe(false);
      if (!result.success) {
        // If it doesn't have isRequestError, it's a ZodError
        if (!("isRequestError" in result.error)) {
          expect(result.error.name).toBe("ZodError");
          expect(result.error.issues).toBeDefined();
          expect(result.error.issues.length).toBeGreaterThan(0);
          expect(result.error.issues[0].path).toEqual(["username"]);
          expect(result.error.issues[0].code).toBe("invalid_type");
        }
      }
    });

    it("should pass through HTTP errors directly", async () => {
      const httpError = {
        success: false,
        error: {
          name: "RequestError",
          message: "Unauthorized",
          detail: "Invalid API key",
          status: 401,
          isRequestError: true,
        },
      } as const;

      vi.spyOn(client, "safeGet").mockResolvedValue(httpError);

      const result = await safeGetCurrentUser(client);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("Unauthorized");
        if ("isRequestError" in result.error && result.error.isRequestError) {
          expect(result.error.status).toBe(401);
        }
      }
    });

    it("should return raw data when schema is false", async () => {
      const rawData = { some: "raw", data: 123 };
      vi.spyOn(client, "safeGet").mockResolvedValue({
        success: true,
        data: rawData,
      });

      const result = await safeGetCurrentUser(client, { schema: false });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(rawData);
      }
    });

    it("should use custom schema when provided", async () => {
      const customSchema = z.object({
        id: z.number(),
        name: z.string(),
      });
      const customData = { id: 1, name: "test" };
      
      vi.spyOn(client, "safeGet").mockResolvedValue({
        success: true,
        data: customData,
      });

      const result = await safeGetCurrentUser(client, { schema: customSchema });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(customData);
      }
    });

    it("should return validation error when custom schema fails", async () => {
      const customSchema = z.object({
        id: z.number(),
        name: z.string(),
      });
      const invalidData = { id: "invalid", name: 123 };
      
      vi.spyOn(client, "safeGet").mockResolvedValue({
        success: true,
        data: invalidData,
      });

      const result = await safeGetCurrentUser(client, { schema: customSchema });

      expect(result.success).toBe(false);
      if (!result.success) {
        if (!("isRequestError" in result.error)) {
          expect(result.error.name).toBe("ZodError");
          expect(result.error.issues).toBeDefined();
        }
      }
    });
  });

  describe("parameter handling", () => {
    it("should work without parameters", async () => {
      vi.spyOn(client, "get").mockResolvedValue(mockUserData);

      const result = await getCurrentUser(client);
      expect(result).toEqual(mockUserData);
    });

    it("should work with empty parameters object", async () => {
      vi.spyOn(client, "get").mockResolvedValue(mockUserData);

      const result = await getCurrentUser(client, {});
      expect(result).toEqual(mockUserData);
    });

    it("should work with safe version without parameters", async () => {
      vi.spyOn(client, "safeGet").mockResolvedValue({
        success: true,
        data: mockUserData,
      });

      const result = await safeGetCurrentUser(client);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockUserData);
      }
    });

    it("should work with safe version with empty parameters object", async () => {
      vi.spyOn(client, "safeGet").mockResolvedValue({
        success: true,
        data: mockUserData,
      });

      const result = await safeGetCurrentUser(client, {});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockUserData);
      }
    });
  });

  describe("schema flexibility", () => {
    it("should allow extra fields in API response for forward compatibility", async () => {
      const responseWithExtraFields = {
        ...mockUserData,
        // Extra fields that might be added in future API versions
        new_feature: "some_value",
        premium_features: {
          enabled: true,
          plan: "pro",
        },
        metadata: {
          last_login: "2024-01-01T00:00:00Z",
          preferences: {
            theme: "dark",
            language: "en",
          },
        },
      };

      vi.spyOn(client, "safeGet").mockResolvedValue({
        success: true,
        data: responseWithExtraFields,
      });

      const result = await safeGetCurrentUser(client);

      expect(result.success).toBe(true);
      if (result.success) {
        // Should include the core fields
        expect((result.data as CurrentUser).username).toBe(mockUserData.username);
        expect((result.data as CurrentUser).email).toBe(mockUserData.email);
        expect((result.data as CurrentUser).credits).toBe(mockUserData.credits);
        
        // Should also include the extra fields (due to passthrough())
        expect((result.data as any).new_feature).toBe("some_value");
        expect((result.data as any).premium_features).toEqual({
          enabled: true,
          plan: "pro",
        });
      }
    });
  });

  describe("type inference", () => {
    it("should infer CurrentUser type when no schema provided", async () => {
      mockGet.mockResolvedValueOnce(mockUserData);
      
      const result = await getCurrentUser(client);
      
      // TypeScript should infer this as CurrentUser
      expect(result.username).toBe("testuser");
      expect(result.email).toBe("testuser@phala.network");
      expect(result.credits).toBe(1000);
      expect(result.team_name).toBe("Test Team");
    });

    it("should infer unknown type when schema is false", async () => {
      const rawResponse = { id: 1, username: "testuser", custom_field: "extra" };
      mockGet.mockResolvedValueOnce(rawResponse);
      
      const result = await getCurrentUser(client, { schema: false });
      
      // TypeScript should infer this as unknown
      expect(result).toEqual(rawResponse);
    });

    it("should infer custom schema type when provided", async () => {
      const customSchema = z.object({ id: z.number(), name: z.string() });
      const customResponse = { id: 1, name: "Test User" };
      mockGet.mockResolvedValueOnce(customResponse);
      
      const result = await getCurrentUser(client, { schema: customSchema });
      
      // TypeScript should infer this as { id: number; name: string }
      expect(result.id).toBe(1);
      expect(result.name).toBe("Test User");
    });
  });

  describe("safe version type inference", () => {
    it("should infer SafeResult<CurrentUser> when no schema provided", async () => {
      mockSafeGet.mockResolvedValueOnce({
        success: true,
        data: mockUserData,
      });
      
      const result = await safeGetCurrentUser(client);
      
      if (result.success) {
        // TypeScript should infer result.data as CurrentUser
        expect(result.data.username).toBe("testuser");
        expect(result.data.email).toBe("testuser@phala.network");
        expect(result.data.credits).toBe(1000);
        expect(result.data.team_name).toBe("Test Team");
      }
    });

    it("should infer SafeResult<unknown> when schema is false", async () => {
      const rawResponse = { id: 1, username: "testuser", custom_field: "extra" };
      mockSafeGet.mockResolvedValueOnce({
        success: true,
        data: rawResponse,
      });
      
      const result = await safeGetCurrentUser(client, { schema: false });
      
      if (result.success) {
        // TypeScript should infer result.data as unknown
        expect(result.data).toEqual(rawResponse);
      }
    });

    it("should infer custom type when custom schema provided", async () => {
      const customSchema = z.object({ id: z.number(), name: z.string() });
      const customResponse = { id: 1, name: "Test User" };
      mockSafeGet.mockResolvedValueOnce({
        success: true,
        data: customResponse,
      });
      
      const result = await safeGetCurrentUser(client, { schema: customSchema });
      
      if (result.success) {
        // TypeScript should infer result.data as { id: number; name: string }
        expect(result.data.id).toBe(1);
        expect(result.data.name).toBe("Test User");
      }
    });
  });
}); 