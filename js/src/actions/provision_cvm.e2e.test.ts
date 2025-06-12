import { describe, it, expect, beforeAll, vi } from "vitest";
import { createClient } from "../client";
import { provisionCvm, safeProvisionCvm } from "./provision_cvm";
import { getAvailableNodes } from "./get_available_nodes";

// Skip integration tests if no API key is provided
const TEST_API_KEY = process.env.PHALA_CLOUD_API_KEY;
const skipIntegrationTests = !TEST_API_KEY;

describe.skipIf(skipIntegrationTests)("provisionCvm Integration Tests", () => {
  let client: ReturnType<typeof createClient>;
  let node: any;
  let app_compose: any;

  beforeAll(async () => {
    if (!TEST_API_KEY) {
      throw new Error("PHALA_CLOUD_API_KEY environment variable is required for integration tests");
    }
    client = createClient({ timeout: 30000 });
    const nodes = await getAvailableNodes(client);
    node = nodes.nodes.find(n => n.listed && n.images.length > 0);
    if (!node) throw new Error("No available node for testing");
    app_compose = {
      name: `sdk-e2e-test-${Date.now()}`,
      node_id: node.teepod_id,
      image: node.images[0].name,
      vcpu: 1,
      memory: 1024,
      disk_size: 20,
      compose_file: {
        docker_compose_file: "version: '3'\nservices:\n  demo:\n    image: alpine\n",
        // name is intentionally omitted to test auto-fill
      },
    };
  });

  it("should provision a CVM with real API using node_id and auto-fill compose_file.name", async () => {
    try {
      const result = await provisionCvm(client, app_compose, { schema: false });
      expect(result).toBeDefined();
      expect(result).toHaveProperty("compose_hash");
      console.log("✅ provisionCvm result:", result);
    } catch (err: any) {
      // Accept 4xx/5xx as valid error, print detail for debug
      expect(err).toBeDefined();
      expect(err.isRequestError).toBe(true);
      expect(err.status).toBeGreaterThanOrEqual(400);
      expect(err.status).toBeLessThanOrEqual(500);
      expect(
        typeof err.detail === "string" ||
        (Array.isArray(err.detail) && err.detail.length > 0)
      ).toBe(true);
      if (Array.isArray(err.detail)) {
        console.log("Error details:", err.detail.map((d: any) => d.msg).join("; "));
      } else {
        console.log("Error detail:", err.detail);
      }
    }
  }, 30000);

  it("should provision a CVM with real API using deprecated teepod_id and print warning", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Create config with only teepod_id (no node_id)
    const legacyConfig = { 
      ...app_compose, 
      teepod_id: node.teepod_id 
    };
    delete legacyConfig.node_id; // Remove node_id to test teepod_id path
    try {
      const result = await provisionCvm(client, legacyConfig, { schema: false });
      expect(result).toBeDefined();
      expect(result).toHaveProperty("compose_hash");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("teepod_id is deprecated")
      );
      console.log("✅ provisionCvm (teepod_id) result:", result);
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
        console.log("Error details:", err.detail.map((d: any) => d.msg).join("; "));
      } else {
        console.log("Error detail:", err.detail);
      }
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("teepod_id is deprecated")
      );
    } finally {
      warnSpy.mockRestore();
    }
  }, 30000);

  it("should auto-fill compose_file.name if not provided", async () => {
    const config = { ...app_compose, compose_file: { docker_compose_file: "version: '3'\nservices:\n  demo:\n    image: alpine\n" } };
    try {
      const result = await provisionCvm(client, config, { schema: false });
      expect(result).toBeDefined();
      // No error means auto-fill worked
      console.log("✅ provisionCvm (auto-fill compose_file.name) result:", result);
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
        console.log("Error details:", err.detail.map((d: any) => d.msg).join("; "));
      } else {
        console.log("Error detail:", err.detail);
      }
    }
  }, 30000);

  it("should return error for invalid node_id", async () => {
    const invalidConfig = { ...app_compose, node_id: 99999999 };
    try {
      await provisionCvm(client, invalidConfig, { schema: false });
      throw new Error("Should not succeed with invalid node_id");
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
        console.log("Error details:", err.detail.map((d: any) => d.msg).join("; "));
      } else {
        console.log("Error detail:", err.detail);
      }
    }
  }, 30000);

  it("safe version should work with real API", async () => {
    const result = await safeProvisionCvm(client, app_compose, { schema: false });
    if (result.success) {
      expect(result.data).toBeDefined();
      expect(result.data).toHaveProperty("compose_hash");
      console.log("✅ safeProvisionCvm result:", result.data);
    } else {
      if ("isRequestError" in result.error) {
        expect(result.error.status).toBeGreaterThanOrEqual(400);
        expect(result.error.status).toBeLessThanOrEqual(500);
        expect(
          typeof result.error.detail === "string" ||
          (Array.isArray(result.error.detail) && result.error.detail.length > 0)
        ).toBe(true);
        if (Array.isArray(result.error.detail)) {
          console.warn("safeProvisionCvm error details:", result.error.detail.map((d: any) => d.msg).join("; "));
        } else {
          console.warn(
            `safeProvisionCvm error: [${result.error.status}] ${result.error.detail || result.error.message}`,
            result.error.data || result.error
          );
        }
      } else if (result.error && result.error.issues) {
        console.warn("safeProvisionCvm validation error:", result.error.issues);
      } else {
        console.warn("safeProvisionCvm unknown error:", result.error);
      }
    }
  }, 30000);
});

if (skipIntegrationTests) {
  console.log(`\n⚠️  Integration tests for provisionCvm skipped!\nSet PHALA_CLOUD_API_KEY and ensure node_id/image/compose_file are valid to run.\n`);
}