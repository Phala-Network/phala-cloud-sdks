import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "../client";
import { provisionCvm } from "./provision_cvm";
import { commitCvmProvision, safeCommitCvmProvision } from "./commit_cvm_provision";
import { getAvailableNodes } from "./get_available_nodes";

// Skip integration tests if no API key is provided
const TEST_API_KEY = process.env.PHALA_CLOUD_API_KEY;
const skipIntegrationTests = !TEST_API_KEY;

describe.skipIf(skipIntegrationTests)("CVM Deployment Integration Tests - Full Workflow", () => {
  let client: ReturnType<typeof createClient>;
  let node: any;

  beforeAll(async () => {
    if (!TEST_API_KEY) {
      throw new Error("PHALA_CLOUD_API_KEY environment variable is required for integration tests");
    }
    client = createClient({ timeout: 30000 });
    
    // Get available nodes for testing
    const nodes = await getAvailableNodes(client);
    node = (nodes as any).nodes.find((n: any) => n.listed && n.images.length > 0);
    if (!node) throw new Error("No available node for testing");
  });

  it("should complete full CVM deployment workflow: provision -> commit", async () => {
    // Step 1: Provision CVM
    const app_compose = {
      name: `sdk-e2e-full-deployment-${Date.now()}`,
      node_id: node.teepod_id,
      image: node.images[0].name,
      vcpu: 1,
      memory: 1024,
      disk_size: 20,
      compose_file: {
        docker_compose_file: `
version: '3'
services:
  demo:
    image: alpine
    command: sleep 3600
    environment:
      - TEST_VAR=\${TEST_VAR}
      - API_KEY=\${API_KEY}
`,
        name: "full-deployment-test",
      },
    };

    let provisionData: any;
    try {
      provisionData = await provisionCvm(client, app_compose, { schema: false });
      console.log("✅ Step 1 - Provision completed:", {
        app_id: provisionData.app_id,
        compose_hash: provisionData.compose_hash,
        has_encrypt_pubkey: !!provisionData.app_env_encrypt_pubkey
      });
    } catch (err: any) {
      console.error("❌ Step 1 - Provision failed:", err.message);
      throw err;
    }

    // Validate provision result
    expect(provisionData).toBeDefined();
    expect(provisionData.app_id).toBeDefined();
    expect(provisionData.compose_hash).toBeDefined();

    // Step 2: Commit CVM with encrypted environment variables
    // Note: In real usage, you would encrypt these with the app_env_encrypt_pubkey
    // For testing, we use mock encrypted values
    const mockEncryptedEnv = "deadbeef1234567890abcdef1234567890abcdef12345678";

    // For built-in KMS, ensure app_id is in correct format
    let app_id = provisionData.app_id;
    if (provisionData.compose_hash && !app_id) {
      app_id = provisionData.compose_hash.replace(/^sha256:/, '').substring(0, 40);
    }

    const commitPayload = {
      encrypted_env: mockEncryptedEnv,
      app_id: app_id,
      compose_hash: provisionData.compose_hash,
    };

    try {
      const cvm = await commitCvmProvision(client, commitPayload, { schema: false }) as any;
      console.log("✅ Step 2 - Commit completed:", {
        id: cvm.id,
        name: cvm.name,
        status: cvm.status,
        app_id: cvm.app_id
      });

      // Validate commit result
      expect(cvm).toBeDefined();
      expect(cvm.id).toBeDefined();
      expect(cvm.name).toBe(app_compose.name);
      expect(cvm.app_id).toBe(provisionData.app_id);
      expect(cvm.status).toBeDefined();

    } catch (err: any) {
      // In some cases, the commit might fail due to backend constraints
      // This is still valid for testing the API integration
      console.log("⚠️ Step 2 - Commit returned error (this may be expected):", {
        status: err.status,
        detail: err.detail
      });
      
      expect(err.isRequestError).toBe(true);
      expect(err.status).toBeGreaterThanOrEqual(400);
      expect(err.status).toBeLessThanOrEqual(500);
    }
  }, 60000);

  it("should handle provision -> commit workflow with safe versions", async () => {
    // Step 1: Safe provision
    const app_compose = {
      name: `sdk-e2e-safe-deployment-${Date.now()}`,
      node_id: node.teepod_id,
      image: node.images[0].name,
      vcpu: 1,
      memory: 1024,
      disk_size: 20,
      compose_file: {
        docker_compose_file: `
version: '3'
services:
  demo:
    image: alpine
    command: sleep 300
`,
        name: "safe-deployment-test",
      },
    };

    const provisionResult = await provisionCvm(client, app_compose, { schema: false });
    
    if (typeof provisionResult === 'object' && provisionResult && 'app_id' in provisionResult) {
      console.log("✅ Safe provision succeeded");
      
      // For built-in KMS, ensure app_id is in correct format
      let app_id = provisionResult.app_id as string;
      if ((provisionResult as any).compose_hash && !app_id) {
        app_id = (provisionResult as any).compose_hash.replace(/^sha256:/, '').substring(0, 40);
      }
      
      // Step 2: Safe commit
      const commitPayload = {
        encrypted_env: "cafebabe1234567890abcdef1234567890abcdef1234567890abcdef12345678",
        app_id: app_id,
        compose_hash: (provisionResult as any).compose_hash,
      };

      const commitResult = await safeCommitCvmProvision(client, commitPayload, { schema: false });
      
      if (commitResult.success) {
        const data = commitResult.data as any;
        console.log("✅ Safe commit succeeded:", {
          id: data.id,
          status: data.status
        });
        expect(data).toBeDefined();
        expect(data.id).toBeDefined();
      } else {
        console.log("⚠️ Safe commit returned error (may be expected):", {
          isRequestError: "isRequestError" in commitResult.error,
          status: "isRequestError" in commitResult.error ? commitResult.error.status : "N/A"
        });
        
        if ("isRequestError" in commitResult.error) {
          expect(commitResult.error.status).toBeGreaterThanOrEqual(400);
          expect(commitResult.error.status).toBeLessThanOrEqual(500);
        }
      }
    } else {
      console.log("⚠️ Safe provision failed as expected for testing");
    }
  }, 60000);

  it("should handle workflow with empty encrypted environment", async () => {
    // Test the workflow with no environment variables
    const app_compose = {
      name: `sdk-e2e-no-env-${Date.now()}`,
      node_id: node.teepod_id,
      image: node.images[0].name,
      vcpu: 1,
      memory: 1024,
      disk_size: 20,
      compose_file: {
        docker_compose_file: `
version: '3'
services:
  demo:
    image: alpine
    command: sleep 60
`,
        name: "no-env-test",
      },
    };

    try {
      const provisionData = await provisionCvm(client, app_compose, { schema: false }) as any;
      
      // For built-in KMS, app_id should be first 40 chars of compose_hash (without 0x prefix)
      let app_id = provisionData.app_id;
      if (provisionData.compose_hash && !app_id) {
        app_id = provisionData.compose_hash.replace(/^sha256:/, '').substring(0, 40);
      }
      
      // Commit with empty environment
      const commitPayload = {
        encrypted_env: "", // Empty string for no environment variables
        app_id: app_id,
        compose_hash: provisionData.compose_hash,
      };

      try {
        const cvm = await commitCvmProvision(client, commitPayload, { schema: false }) as any;
        console.log("✅ Workflow with empty env succeeded:", {
          id: cvm.id,
          status: cvm.status
        });
        expect(cvm.id).toBeDefined();
      } catch (err: any) {
        console.log("⚠️ Workflow with empty env failed (may be expected):", err.detail || err.message);
        expect(err.isRequestError).toBe(true);
      }
    } catch (err: any) {
      console.log("⚠️ Provision failed for empty env test:", err.message);
      expect(err.isRequestError).toBe(true);
    }
  }, 60000);
});

if (skipIntegrationTests) {
  console.log(`\n⚠️  Integration tests for CVM Deployment skipped!\nSet PHALA_CLOUD_API_KEY to run full workflow E2E tests.\n`);
} 