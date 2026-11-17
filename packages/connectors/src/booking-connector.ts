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
 * à partir de leur documentation officielle (phase 6) ; d'ici là, MockConnector (phase 2).
 */
export interface BookingConnector {
  readonly provider: BookingProvider;

  listCompletedBookings(club: ConnectorClubConfig, since: Date): Promise<Booking[]>;

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
