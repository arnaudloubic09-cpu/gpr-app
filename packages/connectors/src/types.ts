import type { BookingProvider, BookingStatus } from '@gpr/core';

/**
 * Modèle de réservation NEUTRE (indépendant du fournisseur).
 * Minimisation RGPD : uniquement ce qui sert au calcul des points.
 */
export interface Booking {
  provider: BookingProvider;
  externalId: string;
  externalClubId: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  /** Réservataire, s'il est connu. */
  bookerExternalId: string | null;
}

export interface Participant {
  externalPlayerId: string;
}

export interface ExternalPlayerRef {
  provider: BookingProvider;
  externalPlayerId: string;
}

export interface PlayerIdentity {
  email?: string;
  phone?: string;
}

export interface ConnectorClubConfig {
  externalClubId: string;
  /** Identifiants déchiffrés, uniquement en mémoire le temps de l'appel. */
  credentials: Record<string, string>;
}
