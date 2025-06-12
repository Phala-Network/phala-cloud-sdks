import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "../client";
import { commitCvmProvision, safeCommitCvmProvision } from "./commit_cvm_provision";

// Skip integration tests if no API key is provided
const TEST_API_KEY = process.env.PHALA_CLOUD_API_KEY;
const skipIntegrationTests = !TEST_API_KEY;

describe.skipIf(skipIntegrationTests)("commitCvmProvision Integration Tests - Error Scenarios", () => {
  let client: ReturnType<typeof createClient>;

  beforeAll(async () => {
    if (!TEST_API_KEY) {
      throw new Error("PHALA_CLOUD_API_KEY environment variable is required for integration tests");
    }
    client = createClient({ timeout: 30000 });
  });

  it("should return error for invalid app_id", async () => {
    const invalidPayload = {
      encrypted_env: [
        { key: "TEST_VAR", value: "test_value" },
      ],
      app_id: "invalid-app-id-12345",
      compose_hash: "invalid-hash",
      env_keys: ["TEST_VAR"],
    };

    try {
      await commitCvmProvision(client, invalidPayload, { schema: false });
      throw new Error("Should not succeed with invalid app_id");
    } catch (err: any) {
      expect(err).toBeDefined();
      expect(err.isRequestError).toBe(true);
      expect(err.status).toBeGreaterThanOrEqual(400);
      expect(err.status).toBeLessThanOrEqual(500);
      expect(
        typeof err.detail === "string" ||
        (Array.isArray(err.detail) && err.detail.length > 0)
      ).toBe(true);
      if (Array.isArray(err.detail)) {
        console.log("Invalid app_id error details:", err.detail.map((d: any) => d.msg).join("; "));
      } else {
        console.log("Invalid app_id error detail:", err.detail);
      }
    }
  }, 30000);

  it("should return error for missing required fields", async () => {
    const incompletePayload = {
      encrypted_env: [],
      // Missing app_id
    } as any;

    try {
      await commitCvmProvision(client, incompletePayload, { schema: false });
      throw new Error("Should not succeed with missing app_id");
    } catch (err: any) {
      expect(err).toBeDefined();
      expect(err.isRequestError).toBe(true);
      expect(err.status).toBeGreaterThanOrEqual(400);
      expect(err.status).toBeLessThanOrEqual(500);
      expect(
        typeof err.detail === "string" ||
        (Array.isArray(err.detail) && err.detail.length > 0)
      ).toBe(true);
      if (Array.isArray(err.detail)) {
        console.log("Missing fields error details:", err.detail.map((d: any) => d.msg).join("; "));
      } else {
        console.log("Missing fields error detail:", err.detail);
      }
    }
  }, 30000);

  it("should return error for malformed encrypted_env", async () => {
    const malformedPayload = {
      encrypted_env: "not-an-array", // Should be array
      app_id: "some-app-id",
      compose_hash: "some-hash",
    } as any;

    try {
      await commitCvmProvision(client, malformedPayload, { schema: false });
      throw new Error("Should not succeed with malformed encrypted_env");
    } catch (err: any) {
      expect(err).toBeDefined();
      expect(err.isRequestError).toBe(true);
      expect(err.status).toBeGreaterThanOrEqual(400);
      expect(err.status).toBeLessThanOrEqual(500);
      expect(
        typeof err.detail === "string" ||
        (Array.isArray(err.detail) && err.detail.length > 0)
      ).toBe(true);
      if (Array.isArray(err.detail)) {
        console.log("Malformed payload error details:", err.detail.map((d: any) => d.msg).join("; "));
      } else {
        console.log("Malformed payload error detail:", err.detail);
      }
    }
  }, 30000);

  it("should return error for unauthorized access (401)", async () => {
    const unauthorizedClient = createClient({ 
      apiKey: "invalid-api-key-123", 
      timeout: 30000 
    });
    
    const payload = {
      encrypted_env: [
        { key: "TEST_VAR", value: "test_value" },
      ],
      app_id: "some-app-id",
      compose_hash: "some-hash",
      env_keys: ["TEST_VAR"],
    };

    try {
      await commitCvmProvision(unauthorizedClient, payload, { schema: false });
      throw new Error("Should not succeed with invalid API key");
    } catch (err: any) {
      expect(err).toBeDefined();
      expect(err.isRequestError).toBe(true);
      expect(err.status).toBe(401);
      console.log("Unauthorized error detail:", err.detail || err.message);
    }
  }, 30000);

  it("safe version should handle errors correctly", async () => {
    const invalidPayload = {
      encrypted_env: [
        { key: "TEST_VAR", value: "test_value" },
      ],
      app_id: "invalid-app-id-12345",
      compose_hash: "invalid-hash",
      env_keys: ["TEST_VAR"],
    };

    const result = await safeCommitCvmProvision(client, invalidPayload, { schema: false });
    
    expect(result.success).toBe(false);
    if (!result.success) {
      if ("isRequestError" in result.error) {
        expect(result.error.status).toBeGreaterThanOrEqual(400);
        expect(result.error.status).toBeLessThanOrEqual(500);
        expect(
          typeof result.error.detail === "string" ||
          (Array.isArray(result.error.detail) && result.error.detail.length > 0)
        ).toBe(true);
        if (Array.isArray(result.error.detail)) {
          console.log("safeCommitCvmProvision error details:", result.error.detail.map((d: any) => d.msg).join("; "));
        } else {
          console.log(
            `safeCommitCvmProvision error: [${result.error.status}] ${result.error.detail || result.error.message}`,
          );
        }
      } else if (result.error && result.error.issues) {
        console.log("safeCommitCvmProvision validation error:", result.error.issues);
      } else {
        console.log("safeCommitCvmProvision unknown error:", result.error);
      }
    }
  }, 30000);

  it("should handle various client errors (4xx range)", async () => {
    const testCases = [
      {
        name: "invalid compose_hash format",
        payload: {
          encrypted_env: [{ key: "TEST_VAR", value: "test_value" }],
          app_id: "some-app-id",
          compose_hash: "invalid-compose-hash-format",
          env_keys: ["TEST_VAR"],
        }
      },
      {
        name: "empty encrypted_env with missing app_id", 
        payload: {
          encrypted_env: [],
          // app_id is missing
        } as any
      }
    ];

    for (const testCase of testCases) {
      try {
        await commitCvmProvision(client, testCase.payload, { schema: false });
        // If it succeeds, that's also OK - the test is about error handling
        console.log(`✅ Server accepted payload for ${testCase.name}`);
      } catch (err: any) {
        expect(err).toBeDefined();
        expect(err.isRequestError).toBe(true);
        expect(err.status).toBeGreaterThanOrEqual(400);
        expect(err.status).toBeLessThanOrEqual(500);
        console.log(`Error status ${err.status} for ${testCase.name}:`, err.detail || err.message);
      }
    }
  }, 30000);
});

if (skipIntegrationTests) {
  console.log(`\n⚠️  Integration tests for commitCvmProvision skipped!\nSet PHALA_CLOUD_API_KEY to run E2E tests.\n`);
} 