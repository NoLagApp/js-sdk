/**
 * E2E Tests for NoLag REST API Client
 *
 * Prerequisites:
 * 1. Start Titus backend: cd titus && npm run dev
 * 2. Set environment variables in .env.test:
 *    - NOLAG_API_KEY: Project-scoped API key from Titus
 *    - NOLAG_API_URL: API URL (default: http://localhost:3000/v1)
 *
 * Run tests:
 *   npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NoLagApi, NoLagApiError } from "../../src/api";
import type { App, Room, ActorWithToken } from "../../src/api-types";

const API_URL = process.env.NOLAG_API_URL || "http://localhost:3000/v1";
const API_KEY = process.env.NOLAG_API_KEY;

// Check if credentials are real (not placeholder values)
const hasValidApiKey = API_KEY && API_KEY !== "your-api-key-here";

// Helper to generate unique names for test resources
function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
        await badApi.apps.list();
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
        await badApi.apps.list();
      } catch (error) {
        const apiError = error as NoLagApiError;
        expect(apiError.details).toBeDefined();
        expect(apiError.message).toBeTruthy();
      }
    });
  });

  describe("Apps API", () => {
    let createdApp: App | null = null;

    afterAll(async () => {
      // Cleanup: delete created app
      if (createdApp) {
        try {
          await api.apps.delete(createdApp.appId);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it("should list apps in the project", async () => {
      const result = await api.apps.list();

      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Array);
    });

    it("should create a new app", async () => {
      const appName = uniqueName("test-app");

      const app = await api.apps.create({
        name: appName,
        description: "E2E test app",
      });

      createdApp = app;

      expect(app).toBeDefined();
      expect(app.appId).toBeTruthy();
      expect(app.name).toBe(appName);
      expect(app.description).toBe("E2E test app");
      expect(app.projectId).toBeTruthy();
    });

    it("should get app by ID", async () => {
      expect(createdApp).toBeTruthy();

      const app = await api.apps.get(createdApp!.appId);

      expect(app).toBeDefined();
      expect(app.appId).toBe(createdApp!.appId);
      expect(app.name).toBe(createdApp!.name);
    });

    it("should update app", async () => {
      expect(createdApp).toBeTruthy();

      const updatedDescription = "Updated E2E test app";

      const app = await api.apps.update(createdApp!.appId, {
        description: updatedDescription,
      });

      expect(app).toBeDefined();
      expect(app.description).toBe(updatedDescription);
    });

    it("should throw error for non-existent app", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";

      try {
        await api.apps.get(fakeId);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(NoLagApiError);
        const apiError = error as NoLagApiError;
        // 0 = network error, 400/403/404 = actual API errors
        expect([0, 400, 403, 404]).toContain(apiError.statusCode);
      }
    });

    it("should delete app", async () => {
      expect(createdApp).toBeTruthy();

      const result = await api.apps.delete(createdApp!.appId);

      expect(result.success).toBe(true);

      // Mark as deleted so cleanup doesn't try again
      createdApp = null;
    });
  });

  describe("Full CRUD Flow: App -> Room -> Actor", () => {
    let testApp: App | null = null;
    let testRoom: Room | null = null;
    let testActor: ActorWithToken | null = null;

    afterAll(async () => {
      // Cleanup in reverse order
      if (testActor) {
        try {
          await api.actors.delete(testActor.actorTokenId);
        } catch {
          // Ignore
        }
      }

      if (testRoom && testApp) {
        try {
          await api.rooms.delete(testApp.appId, testRoom.roomId);
        } catch {
          // Ignore
        }
      }

      if (testApp) {
        try {
          await api.apps.delete(testApp.appId);
        } catch {
          // Ignore
        }
      }
    });

    it("should create an app", async () => {
      const app = await api.apps.create({
        name: uniqueName("e2e-flow-app"),
        description: "Full CRUD flow test",
      });

      testApp = app;

      expect(app.appId).toBeTruthy();
      expect(app.projectId).toBeTruthy();
    });

    it("should list apps", async () => {
      const result = await api.apps.list();

      expect(result.data).toBeInstanceOf(Array);
      expect(result.data.some((a) => a.appId === testApp!.appId)).toBe(true);
    });

    it("should get the app by ID", async () => {
      expect(testApp).toBeTruthy();

      const app = await api.apps.get(testApp!.appId);

      expect(app.appId).toBe(testApp!.appId);
      expect(app.name).toBe(testApp!.name);
    });

    it("should update the app", async () => {
      expect(testApp).toBeTruthy();

      const app = await api.apps.update(testApp!.appId, {
        description: "Updated app description",
      });

      expect(app.description).toBe("Updated app description");
    });

    it("should create a room in the app", async () => {
      expect(testApp).toBeTruthy();

      const room = await api.rooms.create(testApp!.appId, {
        name: uniqueName("e2e-flow-room"),
        slug: uniqueName("e2e-room"),
        description: "Test room for E2E flow",
      });

      testRoom = room;

      expect(room.roomId).toBeTruthy();
      expect(room.appId).toBe(testApp!.appId);
    });

    it("should list rooms in the app", async () => {
      expect(testApp).toBeTruthy();

      const rooms = await api.rooms.list(testApp!.appId);

      expect(rooms).toBeInstanceOf(Array);
      expect(rooms.some((r) => r.roomId === testRoom!.roomId)).toBe(true);
    });

    it("should get the room by ID", async () => {
      expect(testApp).toBeTruthy();
      expect(testRoom).toBeTruthy();

      const room = await api.rooms.get(testApp!.appId, testRoom!.roomId);

      expect(room.roomId).toBe(testRoom!.roomId);
      expect(room.name).toBe(testRoom!.name);
    });

    it("should update the room", async () => {
      expect(testApp).toBeTruthy();
      expect(testRoom).toBeTruthy();

      const room = await api.rooms.update(
        testApp!.appId,
        testRoom!.roomId,
        { description: "Updated room description" }
      );

      expect(room.description).toBe("Updated room description");
    });

    it("should create an actor", async () => {
      const actor = await api.actors.create({
        name: uniqueName("e2e-flow-actor"),
        actorType: "device",
      });

      testActor = actor;

      expect(actor.actorTokenId).toBeTruthy();
      expect(actor.accessToken).toBeTruthy(); // Should only be returned on create!
      expect(actor.projectId).toBeTruthy();
      expect(actor.actorType).toBe("device");
    });

    it("should list actors", async () => {
      const actors = await api.actors.list();

      expect(actors).toBeInstanceOf(Array);
      expect(actors.some((a) => a.actorTokenId === testActor!.actorTokenId)).toBe(
        true
      );
    });

    it("should get the actor by ID (without accessToken)", async () => {
      expect(testActor).toBeTruthy();

      const actor = await api.actors.get(testActor!.actorTokenId);

      expect(actor.actorTokenId).toBe(testActor!.actorTokenId);
      expect(actor.name).toBe(testActor!.name);
      // accessToken should NOT be returned on get
      expect((actor as ActorWithToken).accessToken).toBeUndefined();
    });

    it("should update the actor", async () => {
      expect(testActor).toBeTruthy();

      const actor = await api.actors.update(testActor!.actorTokenId, {
        name: "updated-actor-name",
      });

      expect(actor.name).toBe("updated-actor-name");
    });

    it("should delete the actor", async () => {
      expect(testActor).toBeTruthy();

      await api.actors.delete(testActor!.actorTokenId);

      // Verify deletion by trying to get it
      try {
        await api.actors.get(testActor!.actorTokenId);
        expect.fail("Should have thrown error for deleted actor");
      } catch (error) {
        expect(error).toBeInstanceOf(NoLagApiError);
      }

      testActor = null;
    });

    it("should delete the room", async () => {
      expect(testApp).toBeTruthy();
      expect(testRoom).toBeTruthy();

      await api.rooms.delete(testApp!.appId, testRoom!.roomId);

      testRoom = null;
    });

    it("should delete the app", async () => {
      expect(testApp).toBeTruthy();

      const result = await api.apps.delete(testApp!.appId);

      expect(result.success).toBe(true);
      testApp = null;
    });
  });

  describe("API + WebSocket Integration", () => {
    it("should create actor and get access token for WebSocket connection", async () => {
      // This test demonstrates the full flow:
      // 1. Create resources via REST API
      // 2. Create an actor to get access token
      // 3. Use that token for WebSocket connection

      // Create a temporary app
      const app = await api.apps.create({
        name: uniqueName("integration-test"),
        description: "API + WebSocket integration test",
      });

      try {
        // Create an actor
        const actor = await api.actors.create({
          name: "integration-actor",
          actorType: "device",
        });

        try {
          // Verify we got an access token
          expect(actor.accessToken).toBeTruthy();
          expect(actor.accessToken).toMatch(/^at_/); // NoLag access tokens start with at_

          // Note: We don't actually connect via WebSocket here since
          // that would require the Kraken broker to be running.
          // The kraken.e2e.test.ts file handles WebSocket testing.
        } finally {
          // Clean up actor
          await api.actors.delete(actor.actorTokenId);
        }
      } finally {
        // Clean up app
        await api.apps.delete(app.appId);
      }
    });
  });

  describe("Pagination", () => {
    it("should support pagination options", async () => {
      const result = await api.apps.list({
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
