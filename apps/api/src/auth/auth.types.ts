import type { Request } from 'express';

export interface AuthUser {
  id: string;
}

export interface WorkspaceContext {
  id: string;
  role: string;
  permissions: string[];
}

export interface AppRequest extends Request {
  user?: AuthUser;
  workspace?: WorkspaceContext;
}

export interface AccessTokenPayload {
  sub: string;
}
