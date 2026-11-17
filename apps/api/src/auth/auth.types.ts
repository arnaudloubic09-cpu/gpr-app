import type { Role } from '@prisma/client';

/** Utilisateur authentifié attaché à la requête. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  clubId: string | null;
}

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  clubId: string | null;
}
