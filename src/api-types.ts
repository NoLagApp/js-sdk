/**
 * NoLag REST API Types
 *
 * These types are for the project-scoped API.
 * API keys are scoped to a specific project, so organization and project IDs
 * are implicit and not needed in API calls.
 */

// ============ Common Types ============

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

// ============ Actor Types ============

export type ActorTokenType = "device" | "user" | "server";

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
