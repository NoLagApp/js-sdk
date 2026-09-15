/**
 * NoLag REST API Types
 *
 * These types are for the project-scoped API.
 * API keys are scoped to a specific project, so organization and project IDs
 * are implicit and not needed in API calls.
 */

// ============ Common Types ============

/**
 * Shape of every paginated list from the control plane. This is the wire
 * shape the backend actually returns; the previous flat `total/page/limit/
 * totalPages` fields were never populated.
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageCount: number;
  };
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

// ============ App Types ============

export interface App {
  appId: string;
  projectId: string;
  name: string;
  slug?: string;
  description?: string;
  blueprintId?: string;
  config?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface AppCreate {
  name: string;
  slug?: string;
  description?: string;
  blueprintId?: string;
  config?: Record<string, unknown>;
}

export interface AppUpdate {
  name?: string;
  slug?: string;
  description?: string;
  config?: Record<string, unknown>;
}

// ============ Room Types ============

export type RoomType = "static" | "dynamic";

export interface Room {
  roomId: string;
  appId: string;
  name: string;
  slug: string;
  description?: string;
  roomType: RoomType;
  isEnabled: boolean;
  /** Topics available in this room */
  topics?: string[];
  config?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RoomCreate {
  name: string;
  slug?: string;
  description?: string;
  /** Topics available in this room (inherits from App if not set) */
  topics?: string[];
  config?: Record<string, unknown>;
}

export interface RoomUpdate {
  name?: string;
  description?: string;
  isEnabled?: boolean;
  /** Topics available in this room */
  topics?: string[];
  config?: Record<string, unknown>;
}

// ============ Room Actor Access (room ACL) Types ============

/** Access permission for a room grant. */
export type AccessPermission = "subscribe" | "publish" | "pubSub";

/**
 * A room-level ACL grant. A room becomes private the moment it has at least
 * one grant; the broker then only admits actors with an explicit, unexpired grant.
 */
export interface RoomActorAccess {
  roomActorAccessId: string;
  roomId: string;
  actorTokenId: string | null;
  actorType: string | null;
  permission: AccessPermission;
  topics: string[] | null;
  isActive: boolean;
  expiresAt: string | null;
  role: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** Request to grant an actor access to a room. Provide actorTokenId OR actorType. */
export interface RoomActorAccessCreate {
  /** Grant a specific actor token (must belong to this project). */
  actorTokenId?: string;
  /** Or grant by actor type label (e.g. "agent"). */
  actorType?: string;
  permission: AccessPermission;
  /** Restrict to specific topics (defaults to the room/app topics). */
  topics?: string[];
  isActive?: boolean;
  /** ISO 8601 expiry; the broker denies the grant after this time. */
  expiresAt?: string;
  /** Display label (e.g. "moderator"). */
  role?: string;
  metadata?: Record<string, unknown>;
}

// ============ Actor Types ============

/**
 * Actor types the control plane accepts. Only `agent` and `orchestrator`
 * hold a persistent broker session.
 */
export type ActorTokenType =
  | "device"
  | "user"
  | "service"
  | "session"
  | "agent"
  | "orchestrator"
  | "observer";

export interface Actor {
  actorTokenId: string;
  projectId: string;
  name: string;
  actorType: ActorTokenType;
  description?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
  isActive: boolean;
  lastConnectedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActorWithToken extends Actor {
  /** The access token - only shown once at creation! */
  accessToken: string;
}

export interface ActorCreate {
  name: string;
  actorType: ActorTokenType;
  description?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
}

export interface ActorUpdate {
  name?: string;
  description?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
  isActive?: boolean;
  /** Access scope ID for tenant isolation. Set to null to unscope the actor. */
  accessScopeId?: string | null;
}

// ============ Scope Types ============

export interface Scope {
  accessScopeId: string;
  projectId: string;
  slug: string;
  name: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScopeCreate {
  slug: string;
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface ScopeUpdate {
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  isActive?: boolean;
}

// ============ API Options ============

export interface NoLagApiOptions {
  /** Base URL for the API (default: https://api.nolag.app/v1) */
  baseUrl?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
}

export interface ListOptions {
  /** Page number (1-indexed) */
  page?: number;
  /** Items per page */
  limit?: number;
  /** Sort field */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: "asc" | "desc";
  /** Search query */
  search?: string;
}
