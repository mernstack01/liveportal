import type { Request } from 'express';

export interface AuthUser {
  id: string;
}

export interface WorkspaceContext {
  id: string;
  role: string;
  permissions: string[];
}

/** Loyihadagi samarali ruxsatlar: workspace roli + loyiha roli (birlashmasi). */
export interface ProjectContext {
  id: string;
  workspaceId: string;
  /** Loyihadagi rol; a'zo bo'lmasa (masalan, rahbar `dashboard.view_all` bilan ko'ryapti) null. */
  role: string | null;
  permissions: string[];
}

export interface AppRequest extends Request {
  user?: AuthUser;
  workspace?: WorkspaceContext;
  project?: ProjectContext;
}

export interface AccessTokenPayload {
  sub: string;
}
