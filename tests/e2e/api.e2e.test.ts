/**
 * E2E Tests for NoLag REST API Client
 *
 * Prerequisites:
 * 1. Start Titus backend: cd titus && npm run dev
 * 2. Set environment variables in .env.test:
 *    - NOLAG_API_KEY: Valid API key from Titus
 *    - NOLAG_API_URL: API URL (default: http://localhost:3000/v1)
 *    - NOLAG_TEST_ORG_ID: Organization ID to use for tests
 *
 * Run tests:
 *   npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NoLagApi, NoLagApiError } from "../../src/api";
import type {
  Organization,
  Project,
  App,
  Room,
  Actor,
  ActorWithToken,
} from "../../src/api-types";

const API_URL = process.env.NOLAG_API_URL || "http://localhost:3000/v1";
const API_KEY = process.env.NOLAG_API_KEY;
const TEST_ORG_ID = process.env.NOLAG_TEST_ORG_ID;

// Check if credentials are real (not placeholder values)
const hasValidApiKey = API_KEY && API_KEY !== "your-api-key-here";
const hasValidOrgId = TEST_ORG_ID && TEST_ORG_ID !== "your-organization-id-here";

// Helper to generate unique names for test resources
function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper to wait for ms
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!hasValidApiKey)("NoLag API Client E2E", () => {
  let api: NoLagApi;

  beforeAll(() => {
    api = new NoLagApi(API_KEY!, {
      baseUrl: API_URL,
      timeout: 10000,
    });
  });

  describe("API Client Configuration", () => {
    it("should create API client with default options", () => {
      const client = new NoLagApi("test-key");
      expect(client).toBeDefined();
    });

    it("should create API client with custom options", () => {
      const client = new NoLagApi("test-key", {
        baseUrl: "https://custom.api.com/v1",
        timeout: 5000,
        headers: { "X-Custom-Header": "value" },
      });
      expect(client).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should throw NoLagApiError on invalid API key", async () => {
      const badApi = new NoLagApi("invalid-api-key", {
        baseUrl: API_URL,
      });

      try {
        await badApi.organizations.list();
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(NoLagApiError);
        const apiError = error as NoLagApiError;
        // Either auth error (401/403) or network error (0)
        expect([0, 401, 403]).toContain(apiError.statusCode);
      }
    });

    it("should include error details in NoLagApiError", async () => {
      const badApi = new NoLagApi("invalid-api-key", {
        baseUrl: API_URL,
      });

      try {
        await badApi.organizations.list();
      } catch (error) {
        const apiError = error as NoLagApiError;
        expect(apiError.details).toBeDefined();
        expect(apiError.message).toBeTruthy();
      }
    });
  });

  describe.skipIf(!hasValidOrgId)("Organizations API", () => {
    it("should list organizations", async () => {
      const result = await api.organizations.list();

      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Array);
    });

    it("should get organization by ID", async () => {
      const org = await api.organizations.get(TEST_ORG_ID!);

      expect(org).toBeDefined();
      expect(org.organizationId).toBe(TEST_ORG_ID);
      expect(org.name).toBeTruthy();
    });

    it("should throw error for non-existent organization", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";

      try {
        await api.organizations.get(fakeId);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(NoLagApiError);
        const apiError = error as NoLagApiError;
        // 0 = network error, 400/403/404 = actual API errors
        expect([0, 400, 403, 404]).toContain(apiError.statusCode);
      }
    });
  });

  describe.skipIf(!hasValidOrgId)("Projects API", () => {
    let createdProject: Project | null = null;

    afterAll(async () => {
      // Cleanup: delete created project
      if (createdProject) {
        try {
          await api.projects.delete(TEST_ORG_ID!, createdProject.projectId);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it("should list projects in organization", async () => {
      const result = await api.projects.list(TEST_ORG_ID!);

      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Array);
    });

    it("should create a new project", async () => {
      const projectName = uniqueName("test-project");

      const project = await api.projects.create(TEST_ORG_ID!, {
        name: projectName,
        description: "E2E test project",
      });

      createdProject = project;

      expect(project).toBeDefined();
      expect(project.projectId).toBeTruthy();
      expect(project.name).toBe(projectName);
      expect(project.description).toBe("E2E test project");
      expect(project.organizationId).toBe(TEST_ORG_ID);
    });

    it("should get project by ID", async () => {
      expect(createdProject).toBeTruthy();

      const project = await api.projects.get(
        TEST_ORG_ID!,
        createdProject!.projectId
      );

      expect(project).toBeDefined();
      expect(project.projectId).toBe(createdProject!.projectId);
      expect(project.name).toBe(createdProject!.name);
    });

    it("should update project", async () => {
      expect(createdProject).toBeTruthy();

      const updatedDescription = "Updated E2E test project";

      const project = await api.projects.update(
        TEST_ORG_ID!,
        createdProject!.projectId,
        { description: updatedDescription }
      );

      expect(project).toBeDefined();
      expect(project.description).toBe(updatedDescription);
    });

    it("should delete project", async () => {
      expect(createdProject).toBeTruthy();

      const result = await api.projects.delete(
        TEST_ORG_ID!,
        createdProject!.projectId
      );

      expect(result.success).toBe(true);

      // Mark as deleted so cleanup doesn't try again
      createdProject = null;
    });
  });

  describe.skipIf(!hasValidOrgId)("Full CRUD Flow: Project → App → Room → Actor", () => {
    let testProject: Project | null = null;
    let testApp: App | null = null;
    let testRoom: Room | null = null;
    let testActor: ActorWithToken | null = null;

    afterAll(async () => {
      // Cleanup in reverse order
      if (testActor && testProject) {
        try {
          await api.actors.delete(
            TEST_ORG_ID!,
            testProject.projectId,
            testActor.actorTokenId
          );
        } catch {
          // Ignore
        }
      }

      if (testRoom && testProject && testApp) {
        try {
          await api.rooms.delete(
            TEST_ORG_ID!,
            testProject.projectId,
            testApp.appId,
            testRoom.roomId
          );
        } catch {
          // Ignore
        }
      }

      if (testApp && testProject) {
        try {
          await api.apps.delete(
            TEST_ORG_ID!,
            testProject.projectId,
            testApp.appId
          );
        } catch {
          // Ignore
        }
      }

      if (testProject) {
        try {
          await api.projects.delete(TEST_ORG_ID!, testProject.projectId);
        } catch {
          // Ignore
        }
      }
    });

    it("should create a project", async () => {
      const project = await api.projects.create(TEST_ORG_ID!, {
        name: uniqueName("e2e-flow-project"),
        description: "Full CRUD flow test",
      });

      testProject = project;

      expect(project.projectId).toBeTruthy();
      expect(project.organizationId).toBe(TEST_ORG_ID);
    });

    it("should create an app in the project", async () => {
      expect(testProject).toBeTruthy();

      const app = await api.apps.create(
        TEST_ORG_ID!,
        testProject!.projectId,
        {
          name: uniqueName("e2e-flow-app"),
          description: "Test app for E2E flow",
        }
      );

      testApp = app;

      expect(app.appId).toBeTruthy();
      expect(app.projectId).toBe(testProject!.projectId);
    });

    it("should list apps in the project", async () => {
      expect(testProject).toBeTruthy();

      const result = await api.apps.list(TEST_ORG_ID!, testProject!.projectId);

      expect(result.data).toBeInstanceOf(Array);
      expect(result.data.some((a) => a.appId === testApp!.appId)).toBe(true);
    });

    it("should get the app by ID", async () => {
      expect(testProject).toBeTruthy();
      expect(testApp).toBeTruthy();

      const app = await api.apps.get(
        TEST_ORG_ID!,
        testProject!.projectId,
        testApp!.appId
      );

      expect(app.appId).toBe(testApp!.appId);
      expect(app.name).toBe(testApp!.name);
    });

    it("should update the app", async () => {
      expect(testProject).toBeTruthy();
      expect(testApp).toBeTruthy();

      const app = await api.apps.update(
        TEST_ORG_ID!,
        testProject!.projectId,
        testApp!.appId,
        { description: "Updated app description" }
      );

      expect(app.description).toBe("Updated app description");
    });

    it("should create a room in the app", async () => {
      expect(testProject).toBeTruthy();
      expect(testApp).toBeTruthy();

      const room = await api.rooms.create(
        TEST_ORG_ID!,
        testProject!.projectId,
        testApp!.appId,
        {
          name: uniqueName("e2e-flow-room"),
          description: "Test room for E2E flow",
        }
      );

      testRoom = room;

      expect(room.roomId).toBeTruthy();
      expect(room.appId).toBe(testApp!.appId);
    });

    it("should list rooms in the app", async () => {
      expect(testProject).toBeTruthy();
      expect(testApp).toBeTruthy();

      const rooms = await api.rooms.list(
        TEST_ORG_ID!,
        testProject!.projectId,
        testApp!.appId
      );

      expect(rooms).toBeInstanceOf(Array);
      expect(rooms.some((r) => r.roomId === testRoom!.roomId)).toBe(true);
    });

    it("should get the room by ID", async () => {
      expect(testProject).toBeTruthy();
      expect(testApp).toBeTruthy();
      expect(testRoom).toBeTruthy();

      const room = await api.rooms.get(
        TEST_ORG_ID!,
        testProject!.projectId,
        testApp!.appId,
        testRoom!.roomId
      );

      expect(room.roomId).toBe(testRoom!.roomId);
      expect(room.name).toBe(testRoom!.name);
    });

    it("should update the room", async () => {
      expect(testProject).toBeTruthy();
      expect(testApp).toBeTruthy();
      expect(testRoom).toBeTruthy();

      const room = await api.rooms.update(
        TEST_ORG_ID!,
        testProject!.projectId,
        testApp!.appId,
        testRoom!.roomId,
        { description: "Updated room description" }
      );

      expect(room.description).toBe("Updated room description");
    });

    it("should create an actor in the project", async () => {
      expect(testProject).toBeTruthy();

      const actor = await api.actors.create(
        TEST_ORG_ID!,
        testProject!.projectId,
        {
          name: uniqueName("e2e-flow-actor"),
          actorType: "device",
          description: "Test actor for E2E flow",
        }
      );

      testActor = actor;

      expect(actor.actorTokenId).toBeTruthy();
      expect(actor.accessToken).toBeTruthy(); // Should only be returned on create!
      expect(actor.projectId).toBe(testProject!.projectId);
      expect(actor.actorType).toBe("device");
    });

    it("should list actors in the project", async () => {
      expect(testProject).toBeTruthy();

      const actors = await api.actors.list(
        TEST_ORG_ID!,
        testProject!.projectId
      );

      expect(actors).toBeInstanceOf(Array);
      expect(actors.some((a) => a.actorTokenId === testActor!.actorTokenId)).toBe(
        true
      );
    });

    it("should get the actor by ID (without accessToken)", async () => {
      expect(testProject).toBeTruthy();
      expect(testActor).toBeTruthy();

      const actor = await api.actors.get(
        TEST_ORG_ID!,
        testProject!.projectId,
        testActor!.actorTokenId
      );

      expect(actor.actorTokenId).toBe(testActor!.actorTokenId);
      expect(actor.name).toBe(testActor!.name);
      // accessToken should NOT be returned on get
      expect((actor as any).accessToken).toBeUndefined();
    });

    it("should update the actor", async () => {
      expect(testProject).toBeTruthy();
      expect(testActor).toBeTruthy();

      const actor = await api.actors.update(
        TEST_ORG_ID!,
        testProject!.projectId,
        testActor!.actorTokenId,
        { description: "Updated actor description" }
      );

      expect(actor.description).toBe("Updated actor description");
    });

    it("should delete the actor", async () => {
      expect(testProject).toBeTruthy();
      expect(testActor).toBeTruthy();

      await api.actors.delete(
        TEST_ORG_ID!,
        testProject!.projectId,
        testActor!.actorTokenId
      );

      // Verify deletion by trying to get it
      try {
        await api.actors.get(
          TEST_ORG_ID!,
          testProject!.projectId,
          testActor!.actorTokenId
        );
        expect.fail("Should have thrown error for deleted actor");
      } catch (error) {
        expect(error).toBeInstanceOf(NoLagApiError);
      }

      testActor = null;
    });

    it("should delete the room", async () => {
      expect(testProject).toBeTruthy();
      expect(testApp).toBeTruthy();
      expect(testRoom).toBeTruthy();

      await api.rooms.delete(
        TEST_ORG_ID!,
        testProject!.projectId,
        testApp!.appId,
        testRoom!.roomId
      );

      testRoom = null;
    });

    it("should delete the app", async () => {
      expect(testProject).toBeTruthy();
      expect(testApp).toBeTruthy();

      const result = await api.apps.delete(
        TEST_ORG_ID!,
        testProject!.projectId,
        testApp!.appId
      );

      expect(result.success).toBe(true);
      testApp = null;
    });

    it("should delete the project", async () => {
      expect(testProject).toBeTruthy();

      const result = await api.projects.delete(
        TEST_ORG_ID!,
        testProject!.projectId
      );

      expect(result.success).toBe(true);
      testProject = null;
    });
  });

  describe.skipIf(!hasValidOrgId)("API + WebSocket Integration", () => {
    it("should create actor and use token for WebSocket connection", async () => {
      // This test demonstrates the full flow:
      // 1. Create resources via REST API
      // 2. Create an actor to get access token
      // 3. Use that token for WebSocket connection

      // Create a temporary project
      const project = await api.projects.create(TEST_ORG_ID!, {
        name: uniqueName("integration-test"),
        description: "API + WebSocket integration test",
      });

      try {
        // Create an actor
        const actor = await api.actors.create(TEST_ORG_ID!, project.projectId, {
          name: "integration-actor",
          actorType: "device",
        });

        // Verify we got an access token
        expect(actor.accessToken).toBeTruthy();
        expect(actor.accessToken).toMatch(/^at_/); // NoLag access tokens start with at_

        // Note: We don't actually connect via WebSocket here since
        // that would require the Kraken broker to be running.
        // The kraken.e2e.test.ts file handles WebSocket testing.

        // Clean up actor
        await api.actors.delete(
          TEST_ORG_ID!,
          project.projectId,
          actor.actorTokenId
        );
      } finally {
        // Clean up project
        await api.projects.delete(TEST_ORG_ID!, project.projectId);
      }
    });
  });

  describe("Pagination", () => {
    it.skipIf(!hasValidOrgId)("should support pagination options", async () => {
      const result = await api.projects.list(TEST_ORG_ID!, {
        page: 1,
        limit: 5,
      });

      expect(result.data).toBeInstanceOf(Array);
      expect(result.data.length).toBeLessThanOrEqual(5);
      expect(result.page).toBeDefined();
      expect(result.limit).toBeDefined();
    });
  });
});

describe("NoLagApiError", () => {
  it("should have correct properties", () => {
    const error = new NoLagApiError("Test error", 404, {
      statusCode: 404,
      message: "Not found",
      error: "NotFoundError",
    });

    expect(error.name).toBe("NoLagApiError");
    expect(error.message).toBe("Test error");
    expect(error.statusCode).toBe(404);
    expect(error.details.statusCode).toBe(404);
    expect(error.details.message).toBe("Not found");
    expect(error.details.error).toBe("NotFoundError");
  });

  it("should be instanceof Error", () => {
    const error = new NoLagApiError("Test", 500, {
      statusCode: 500,
      message: "Test",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(NoLagApiError);
  });
});
