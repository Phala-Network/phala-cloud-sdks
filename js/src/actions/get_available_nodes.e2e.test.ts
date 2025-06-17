import { describe, it, expect } from "vitest";
import { createClient } from "../client";
import { getAvailableNodes, safeGetAvailableNodes } from "./get_available_nodes";

// These tests require actual API access

describe("getAvailableNodes integration", () => {
  // Client automatically reads PHALA_CLOUD_API_KEY and PHALA_CLOUD_API_PREFIX
  const client = createClient();

  it("should work with real API", async () => {
    if (!process.env.PHALA_CLOUD_API_KEY) {
      console.warn("Skipping integration test: PHALA_CLOUD_API_KEY not set");
      return;
    }

    const result = await getAvailableNodes(client);
    expect(result).toBeDefined();
    expect(result).toHaveProperty("tier");
    expect(result).toHaveProperty("capacity");
    expect(result).toHaveProperty("nodes");
    expect(result).toHaveProperty("kms_list");
  });

  it("safe version should work with real API", async () => {
    if (!process.env.PHALA_CLOUD_API_KEY) {
      console.warn("Skipping integration test: PHALA_CLOUD_API_KEY not set");
      return;
    }

    const result = await safeGetAvailableNodes(client);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeDefined();
      expect(result.data).toHaveProperty("tier");
      expect(result.data).toHaveProperty("capacity");
      expect(result.data).toHaveProperty("nodes");
      expect(result.data).toHaveProperty("kms_list");
    }
  });
}); 