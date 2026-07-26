/**
 * NoLag REST API Client
 *
 * Provides management operations for NoLag resources via REST API.
 * API keys are scoped to a specific project, so no organization or project IDs needed.
 *
 * Use this for managing apps, rooms, and actors within your project.
 * For real-time messaging, use the main NoLag WebSocket client.
 */
import { NoLagApiOptions, ListOptions, PaginatedResult, ApiError, App, AppCreate, AppUpdate, Room, RoomCreate, RoomUpdate, RoomActorAccess, RoomActorAccessCreate, Actor, ActorWithToken, ActorCreate, ActorUpdate, Scope, ScopeCreate, ScopeUpdate } from "./api-types";
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
export declare class NoLagApi {
    private _baseUrl;
    private _apiKey;
    private _timeout;
    private _customHeaders;
    readonly apps: AppsApi;
    readonly rooms: RoomsApi;
    readonly actors: ActorsApi;
    readonly scopes: ScopesApi;
    constructor(apiKey: string, options?: NoLagApiOptions);
    /**
     * Make an authenticated request to the NoLag API
     */
    request<T>(method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined>): Promise<T>;
}
/**
 * API Error class
 */
export declare class NoLagApiError extends Error {
    readonly statusCode: number;
    readonly details: ApiError;
    constructor(message: string, statusCode: number, details: ApiError);
}
declare class AppsApi {
    private _api;
    constructor(_api: NoLagApi);
    /**
     * List all apps in the project
     */
    list(options?: ListOptions): Promise<PaginatedResult<App>>;
    /**
     * Get an app by ID
     */
    get(appId: string): Promise<App>;
    /**
     * Create a new app
     */
    create(data: AppCreate): Promise<App>;
    /**
     * Update an app
     */
    update(appId: string, data: AppUpdate): Promise<App>;
    /**
     * Delete an app (soft delete)
     */
    delete(appId: string): Promise<{
        success: boolean;
    }>;
    /**
     * Reset app to its blueprint configuration
     */
    resetToBlueprint(appId: string): Promise<App>;
}
declare class RoomsApi {
    private _api;
    constructor(_api: NoLagApi);
    /**
     * List all rooms in an app
     */
    list(appId: string): Promise<Room[]>;
    /**
     * Get a room by ID
     */
    get(appId: string, roomId: string): Promise<Room>;
    /**
     * Create a new dynamic room
     */
    create(appId: string, data: RoomCreate): Promise<Room>;
    /**
     * Ensure a dynamic room exists (idempotent create-if-not-exists).
     *
     * For runtime per-entity rooms (a matter id, a device id): the creator
     * calls this once at entity-creation time; everyone else just joins and
     * gets a loud error if the room is missing (the broker never creates rooms
     * implicitly — that would silently hide typo'd/asymmetric slugs). Requires
     * the app to have `config.autoProvisionRooms=true`; capped per app. Returns
     * the existing room unchanged on slug match.
     */
    ensure(appId: string, data: RoomCreate): Promise<Room>;
    /**
     * Update a room
     */
    update(appId: string, roomId: string, data: RoomUpdate): Promise<Room>;
    /**
     * Delete a dynamic room (static rooms cannot be deleted)
     */
    delete(appId: string, roomId: string): Promise<void>;
    /**
     * Grant an actor access to a room (room-level ACL).
     *
     * The first grant makes the room private — after that the broker only admits
     * actors with an explicit, unexpired grant. Pass `actorTokenId` (a token in
     * this project) or `actorType` (a type label). Use this to make a room (e.g.
     * a per-user notification bell) genuinely private.
     */
    grantActor(appId: string, roomId: string, data: RoomActorAccessCreate): Promise<RoomActorAccess>;
    /**
     * List a room's actor grants
     */
    listActors(appId: string, roomId: string): Promise<RoomActorAccess[]>;
    /**
     * Revoke an actor's room access. Removing the last grant makes the room public again.
     */
    revokeActor(appId: string, roomId: string, roomActorAccessId: string): Promise<void>;
}
declare class ActorsApi {
    private _api;
    constructor(_api: NoLagApi);
    /**
     * List all actors in the project
     */
    list(): Promise<Actor[]>;
    /**
     * Get an actor by ID
     */
    get(actorId: string): Promise<Actor>;
    /**
     * Create a new actor
     *
     * IMPORTANT: The access token is only returned once! Save it immediately.
     */
    create(data: ActorCreate): Promise<ActorWithToken>;
    /**
     * Update an actor
     */
    update(actorId: string, data: ActorUpdate): Promise<Actor>;
    /**
     * Delete an actor
     */
    delete(actorId: string): Promise<void>;
}
declare class ScopesApi {
    private _api;
    constructor(_api: NoLagApi);
    /**
     * List all access scopes in the project
     */
    list(options?: ListOptions): Promise<PaginatedResult<Scope>>;
    /**
     * Get an access scope by ID
     */
    get(scopeId: string): Promise<Scope>;
    /**
     * Create a new access scope
     */
    create(data: ScopeCreate): Promise<Scope>;
    /**
     * Update an access scope
     */
    update(scopeId: string, data: ScopeUpdate): Promise<Scope>;
    /**
     * Delete an access scope
     */
    delete(scopeId: string): Promise<void>;
    /**
     * List actors assigned to a scope
     */
    listActors(scopeId: string): Promise<Actor[]>;
    /**
     * Assign an actor to this scope
     */
    addActor(scopeId: string, actorId: string): Promise<Actor>;
    /**
     * Remove an actor from this scope (unscope it)
     */
    removeActor(actorId: string): Promise<Actor>;
}
export {};
