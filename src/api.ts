/**
 * NoLag REST API Client
 *
 * Provides management operations for NoLag resources via REST API.
 * API keys are scoped to a specific project, so no organization or project IDs needed.
 *
 * Use this for managing apps, rooms, and actors within your project.
 * For real-time messaging, use the main NoLag WebSocket client.
 */

import {
  NoLagApiOptions,
  ListOptions,
  PaginatedResult,
  ApiError,
  App,
  AppCreate,
  AppUpdate,
  Room,
  RoomCreate,
  RoomUpdate,
  Actor,
  ActorWithToken,
  ActorCreate,
  ActorUpdate,
} from "./api-types";

const DEFAULT_BASE_URL = "https://api.nolag.app/v1";
const DEFAULT_TIMEOUT = 30000;

/**
 * NoLag REST API Client
 *
 * API keys are project-scoped, so you don't need to pass organization or project IDs.
 *
 * @example
 * ```typescript
 * // Create client with project API key
 * const api = new NoLagApi('nlg_live_xxx.secret');
 *
 * // List apps in your project
 * const apps = await api.apps.list();
 *
 * // Create a room
 * const room = await api.rooms.create(appId, {
 *   name: 'chat-room',
 *   description: 'General chat'
 * });
 *
 * // Create an actor and get the access token
 * const actor = await api.actors.create({
 *   name: 'web-client',
 *   actorType: 'device'
 * });
 * console.log('Save this token:', actor.accessToken);
 * ```
 */
export class NoLagApi {
  private _baseUrl: string;
  private _apiKey: string;
  private _timeout: number;
  private _customHeaders: Record<string, string>;

  readonly apps: AppsApi;
  readonly rooms: RoomsApi;
  readonly actors: ActorsApi;

  constructor(apiKey: string, options?: NoLagApiOptions) {
    this._apiKey = apiKey;
    this._baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this._timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    this._customHeaders = options?.headers ?? {};

    // Initialize sub-APIs
    this.apps = new AppsApi(this);
    this.rooms = new RoomsApi(this);
    this.actors = new ActorsApi(this);
  }

  /**
   * Make an authenticated request to the NoLag API
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>
  ): Promise<T> {
    const url = new URL(`${this._baseUrl}${path}`);

    // Add query parameters
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this._apiKey}`,
      "Content-Type": "application/json",
      ...this._customHeaders,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData: ApiError;
        try {
          errorData = await response.json();
        } catch {
          errorData = {
            statusCode: response.status,
            message: response.statusText || "Request failed",
          };
        }
        throw new NoLagApiError(
          errorData.message || "Request failed",
          response.status,
          errorData
        );
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof NoLagApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new NoLagApiError("Request timeout", 408, {
          statusCode: 408,
          message: "Request timeout",
        });
      }

      throw new NoLagApiError(
        error instanceof Error ? error.message : "Unknown error",
        0,
        { statusCode: 0, message: "Network error" }
      );
    }
  }
}

/**
 * API Error class
 */
export class NoLagApiError extends Error {
  readonly statusCode: number;
  readonly details: ApiError;

  constructor(message: string, statusCode: number, details: ApiError) {
    super(message);
    this.name = "NoLagApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

// ============ Apps API ============

class AppsApi {
  constructor(private _api: NoLagApi) {}

  /**
   * List all apps in the project
   */
  async list(options?: ListOptions): Promise<PaginatedResult<App>> {
    return this._api.request<PaginatedResult<App>>(
      "GET",
      "/apps",
      undefined,
      options as Record<string, string | number | undefined>
    );
  }

  /**
   * Get an app by ID
   */
  async get(appId: string): Promise<App> {
    return this._api.request<App>("GET", `/apps/${appId}`);
  }

  /**
   * Create a new app
   */
  async create(data: AppCreate): Promise<App> {
    return this._api.request<App>("POST", "/apps", data);
  }

  /**
   * Update an app
   */
  async update(appId: string, data: AppUpdate): Promise<App> {
    return this._api.request<App>("PATCH", `/apps/${appId}`, data);
  }

  /**
   * Delete an app (soft delete)
   */
  async delete(appId: string): Promise<{ success: boolean }> {
    return this._api.request<{ success: boolean }>("DELETE", `/apps/${appId}`);
  }

  /**
   * Reset app to its blueprint configuration
   */
  async resetToBlueprint(appId: string): Promise<App> {
    return this._api.request<App>("POST", `/apps/${appId}/reset-to-blueprint`);
  }
}

// ============ Rooms API ============

class RoomsApi {
  constructor(private _api: NoLagApi) {}

  /**
   * List all rooms in an app
   */
  async list(appId: string): Promise<Room[]> {
    return this._api.request<Room[]>("GET", `/apps/${appId}/rooms`);
  }

  /**
   * Get a room by ID
   */
  async get(appId: string, roomId: string): Promise<Room> {
    return this._api.request<Room>("GET", `/apps/${appId}/rooms/${roomId}`);
  }

  /**
   * Create a new dynamic room
   */
  async create(appId: string, data: RoomCreate): Promise<Room> {
    return this._api.request<Room>("POST", `/apps/${appId}/rooms`, data);
  }

  /**
   * Update a room
   */
  async update(appId: string, roomId: string, data: RoomUpdate): Promise<Room> {
    return this._api.request<Room>(
      "PATCH",
      `/apps/${appId}/rooms/${roomId}`,
      data
    );
  }

  /**
   * Delete a dynamic room (static rooms cannot be deleted)
   */
  async delete(appId: string, roomId: string): Promise<void> {
    await this._api.request<void>("DELETE", `/apps/${appId}/rooms/${roomId}`);
  }
}

// ============ Actors API ============

class ActorsApi {
  constructor(private _api: NoLagApi) {}

  /**
   * List all actors in the project
   */
  async list(): Promise<Actor[]> {
    return this._api.request<Actor[]>("GET", "/actors");
  }

  /**
   * Get an actor by ID
   */
  async get(actorId: string): Promise<Actor> {
    return this._api.request<Actor>("GET", `/actors/${actorId}`);
  }

  /**
   * Create a new actor
   *
   * IMPORTANT: The access token is only returned once! Save it immediately.
   */
  async create(data: ActorCreate): Promise<ActorWithToken> {
    return this._api.request<ActorWithToken>("POST", "/actors", data);
  }

  /**
   * Update an actor
   */
  async update(actorId: string, data: ActorUpdate): Promise<Actor> {
    return this._api.request<Actor>("PATCH", `/actors/${actorId}`, data);
  }

  /**
   * Delete an actor
   */
  async delete(actorId: string): Promise<void> {
    await this._api.request<void>("DELETE", `/actors/${actorId}`);
  }
}
