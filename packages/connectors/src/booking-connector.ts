import type { BookingProvider } from '@gpr/core';
import type {
  Booking,
  ConnectorClubConfig,
  ExternalPlayerRef,
  Participant,
  PlayerIdentity,
} from './types';

/**
 * Interface commune à tous les fournisseurs de réservation.
 * Les implémentations Playtomic / Doinsport seront écrites uniquement
 * à partir de leur documentation officielle (phase 6).
 */
export interface BookingConnector {
  readonly provider: BookingProvider;

  /**
   * Réservations dont le créneau s'est terminé depuis `since`, avec leur statut final
   * (terminée, annulée, absence). Les annulations sont nécessaires pour contre-passer
   * des points déjà crédités.
   */
  listEndedBookings(club: ConnectorClubConfig, since: Date, until: Date): Promise<Booking[]>;

  /** Peut renvoyer une liste vide si l'API du fournisseur n'expose pas les participants. */
  getBookingParticipants(
    club: ConnectorClubConfig,
    bookingExternalId: string,
  ): Promise<Participant[]>;

  matchPlayer(
    club: ConnectorClubConfig,
    identity: PlayerIdentity,
  ): Promise<ExternalPlayerRef | null>;
}

export class ConnectorNotImplementedError extends Error {
  constructor(provider: BookingProvider, method: string) {
    super(
      `Connecteur ${provider} : ${method} non implémenté (documentation officielle attendue, phase 6)`,
    );
    this.name = 'ConnectorNotImplementedError';
  }
}
