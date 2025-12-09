/**
 * NoLag REST API Client
 *
 * Provides management operations for NoLag resources via REST API.
 * Use this for creating/managing organizations, projects, apps, rooms, and actors.
 * For real-time messaging, use the main NoLag WebSocket client.
 */

import {
  NoLagApiOptions,
  ListOptions,
  PaginatedResult,
  ApiError,
  Organization,
  OrganizationCreate,
  OrganizationUpdate,
  Project,
  ProjectCreate,
  ProjectUpdate,
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
  Blueprint,
} from "./api-types";

const DEFAULT_BASE_URL = "https://api.nolag.app/v1";
const DEFAULT_TIMEOUT = 30000;

/**
 * NoLag REST API Client
 *
 * @example
 * ```typescript
 * // Using API key
 * const api = new NoLagApi('your-api-key');
 *
 * // List organizations
 * const orgs = await api.organizations.list();
 *
 * // Create a project
 * const project = await api.projects.create(orgId, {
 *   name: 'My Project',
 *   description: 'A real-time app'
 * });
 *
 * // Create an actor and get the access token
 * const actor = await api.actors.create(orgId, projectId, {
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

  readonly organizations: OrganizationsApi;
  readonly projects: ProjectsApi;
  readonly apps: AppsApi;
  readonly rooms: RoomsApi;
  readonly actors: ActorsApi;
  readonly blueprints: BlueprintsApi;

  constructor(apiKey: string, options?: NoLagApiOptions) {
    this._apiKey = apiKey;
    this._baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this._timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    this._customHeaders = options?.headers ?? {};

    // Initialize sub-APIs
    this.organizations = new OrganizationsApi(this);
    this.projects = new ProjectsApi(this);
    this.apps = new AppsApi(this);
    this.rooms = new RoomsApi(this);
    this.actors = new ActorsApi(this);
    this.blueprints = new BlueprintsApi(this);
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

// ============ Organizations API ============

class OrganizationsApi {
  constructor(private _api: NoLagApi) {}

  /**
   * List organizations the authenticated user has access to
   */
  async list(options?: ListOptions): Promise<PaginatedResult<Organization>> {
    return this._api.request<PaginatedResult<Organization>>(
      "GET",
      "/organizations",
      undefined,
      options as Record<string, string | number | undefined>
    );
  }

  /**
   * Get a single organization by ID
   */
  async get(organizationId: string): Promise<Organization> {
    return this._api.request<Organization>(
      "GET",
      `/organizations/${organizationId}`
    );
  }

  /**
   * Create a new organization
   */
  async create(data: OrganizationCreate): Promise<Organization> {
    return this._api.request<Organization>("POST", "/organizations", data);
  }

  /**
   * Update an organization
   */
  async update(
    organizationId: string,
    data: OrganizationUpdate
  ): Promise<Organization> {
    return this._api.request<Organization>(
      "PATCH",
      `/organizations/${organizationId}`,
      data
    );
  }

  /**
   * Delete an organization (soft delete)
   */
  async delete(organizationId: string): Promise<{ success: boolean }> {
    return this._api.request<{ success: boolean }>(
      "DELETE",
      `/organizations/${organizationId}`
    );
  }
}

// ============ Projects API ============

class ProjectsApi {
  constructor(private _api: NoLagApi) {}

  /**
   * List projects in an organization
   */
  async list(
    organizationId: string,
    options?: ListOptions
  ): Promise<PaginatedResult<Project>> {
    return this._api.request<PaginatedResult<Project>>(
      "GET",
      `/organizations/${organizationId}/projects`,
      undefined,
      options as Record<string, string | number | undefined>
    );
  }

  /**
   * Get a single project by ID
   */
  async get(organizationId: string, projectId: string): Promise<Project> {
    return this._api.request<Project>(
      "GET",
      `/organizations/${organizationId}/projects/${projectId}`
    );
  }

  /**
   * Create a new project
   */
  async create(
    organizationId: string,
    data: ProjectCreate
  ): Promise<Project> {
    return this._api.request<Project>(
      "POST",
      `/organizations/${organizationId}/projects`,
      data
    );
  }

  /**
   * Update a project
   */
  async update(
    organizationId: string,
    projectId: string,
    data: ProjectUpdate
  ): Promise<Project> {
    return this._api.request<Project>(
      "PATCH",
      `/organizations/${organizationId}/projects/${projectId}`,
      data
    );
  }

  /**
   * Delete a project (soft delete)
   */
  async delete(
    organizationId: string,
    projectId: string
  ): Promise<{ success: boolean }> {
    return this._api.request<{ success: boolean }>(
      "DELETE",
      `/organizations/${organizationId}/projects/${projectId}`
    );
  }
}

// ============ Apps API ============

class AppsApi {
  constructor(private _api: NoLagApi) {}

  /**
   * List apps in a project
   */
  async list(
    organizationId: string,
    projectId: string,
    options?: ListOptions
  ): Promise<PaginatedResult<App>> {
    return this._api.request<PaginatedResult<App>>(
      "GET",
      `/organizations/${organizationId}/projects/${projectId}/apps`,
      undefined,
      options as Record<string, string | number | undefined>
    );
  }

  /**
   * Get a single app by ID
   */
  async get(
    organizationId: string,
    projectId: string,
    appId: string
  ): Promise<App> {
    return this._api.request<App>(
      "GET",
      `/organizations/${organizationId}/projects/${projectId}/apps/${appId}`
    );
  }

  /**
   * Create a new app
   */
  async create(
    organizationId: string,
    projectId: string,
    data: AppCreate
  ): Promise<App> {
    return this._api.request<App>(
      "POST",
      `/organizations/${organizationId}/projects/${projectId}/apps`,
      data
    );
  }

  /**
   * Update an app
   */
  async update(
    organizationId: string,
    projectId: string,
    appId: string,
    data: AppUpdate
  ): Promise<App> {
    return this._api.request<App>(
      "PATCH",
      `/organizations/${organizationId}/projects/${projectId}/apps/${appId}`,
      data
    );
  }

  /**
   * Delete an app (soft delete)
   */
  async delete(
    organizationId: string,
    projectId: string,
    appId: string
  ): Promise<{ success: boolean }> {
    return this._api.request<{ success: boolean }>(
      "DELETE",
      `/organizations/${organizationId}/projects/${projectId}/apps/${appId}`
    );
  }

  /**
   * Reset app to its blueprint configuration
   */
  async resetToBlueprint(
    organizationId: string,
    projectId: string,
    appId: string
  ): Promise<App> {
    return this._api.request<App>(
      "POST",
      `/organizations/${organizationId}/projects/${projectId}/apps/${appId}/reset-to-blueprint`
    );
  }
}

// ============ Rooms API ============

class RoomsApi {
  constructor(private _api: NoLagApi) {}

  /**
   * List rooms in an app
   */
  async list(
    organizationId: string,
    projectId: string,
    appId: string
  ): Promise<Room[]> {
    return this._api.request<Room[]>(
      "GET",
      `/organizations/${organizationId}/projects/${projectId}/apps/${appId}/rooms`
    );
  }

  /**
   * Get a single room by ID
   */
  async get(
    organizationId: string,
    projectId: string,
    appId: string,
    roomId: string
  ): Promise<Room> {
    return this._api.request<Room>(
      "GET",
      `/organizations/${organizationId}/projects/${projectId}/apps/${appId}/rooms/${roomId}`
    );
  }

  /**
   * Create a new dynamic room
   */
  async create(
    organizationId: string,
    projectId: string,
    appId: string,
    data: RoomCreate
  ): Promise<Room> {
    return this._api.request<Room>(
      "POST",
      `/organizations/${organizationId}/projects/${projectId}/apps/${appId}/rooms`,
      data
    );
  }

  /**
   * Update a room
   */
  async update(
    organizationId: string,
    projectId: string,
    appId: string,
    roomId: string,
    data: RoomUpdate
  ): Promise<Room> {
    return this._api.request<Room>(
      "PATCH",
      `/organizations/${organizationId}/projects/${projectId}/apps/${appId}/rooms/${roomId}`,
      data
    );
  }

  /**
   * Delete a dynamic room (static rooms cannot be deleted)
   */
  async delete(
    organizationId: string,
    projectId: string,
    appId: string,
    roomId: string
  ): Promise<void> {
    await this._api.request<void>(
      "DELETE",
      `/organizations/${organizationId}/projects/${projectId}/apps/${appId}/rooms/${roomId}`
    );
  }
}

// ============ Actors API ============

class ActorsApi {
  constructor(private _api: NoLagApi) {}

  /**
   * List actors in a project
   */
  async list(
    organizationId: string,
    projectId: string
  ): Promise<Actor[]> {
    return this._api.request<Actor[]>(
      "GET",
      `/organizations/${organizationId}/projects/${projectId}/actors`
    );
  }

  /**
   * Get a single actor by ID
   */
  async get(
    organizationId: string,
    projectId: string,
    actorId: string
  ): Promise<Actor> {
    return this._api.request<Actor>(
      "GET",
      `/organizations/${organizationId}/projects/${projectId}/actors/${actorId}`
    );
  }

  /**
   * Create a new actor
   *
   * IMPORTANT: The access token is only returned once! Save it immediately.
   */
  async create(
    organizationId: string,
    projectId: string,
    data: ActorCreate
  ): Promise<ActorWithToken> {
    return this._api.request<ActorWithToken>(
      "POST",
      `/organizations/${organizationId}/projects/${projectId}/actors`,
      data
    );
  }

  /**
   * Update an actor
   */
  async update(
    organizationId: string,
    projectId: string,
    actorId: string,
    data: ActorUpdate
  ): Promise<Actor> {
    return this._api.request<Actor>(
      "PATCH",
      `/organizations/${organizationId}/projects/${projectId}/actors/${actorId}`,
      data
    );
  }

  /**
   * Delete an actor
   */
  async delete(
    organizationId: string,
    projectId: string,
    actorId: string
  ): Promise<void> {
    await this._api.request<void>(
      "DELETE",
      `/organizations/${organizationId}/projects/${projectId}/actors/${actorId}`
    );
  }
}

// ============ Blueprints API ============

class BlueprintsApi {
  constructor(private _api: NoLagApi) {}

  /**
   * List public blueprints
   */
  async listPublic(): Promise<Blueprint[]> {
    return this._api.request<Blueprint[]>("GET", "/blueprints");
  }

  /**
   * List organization's private blueprints
   */
  async list(organizationId: string): Promise<Blueprint[]> {
    return this._api.request<Blueprint[]>(
      "GET",
      `/organizations/${organizationId}/blueprints`
    );
  }

  /**
   * Get a blueprint by ID
   */
  async get(blueprintId: string): Promise<Blueprint> {
    return this._api.request<Blueprint>("GET", `/blueprints/${blueprintId}`);
  }
}
