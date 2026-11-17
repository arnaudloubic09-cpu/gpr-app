import type { BookingConnector } from './booking-connector';
import { ConnectorNotImplementedError } from './booking-connector';
import type {
  Booking,
  ConnectorClubConfig,
  ExternalPlayerRef,
  Participant,
  PlayerIdentity,
} from './types';

/**
 * Connecteur Playtomic — SQUELETTE (phase 6).
 * Aucun endpoint, champ ou format n'est supposé ici : tout sera écrit à partir
 * de la documentation officielle fournie par le client.
 *
 * TODO(phase 6) :
 *  - mode d'accès (par club ou par réseau) et authentification ;
 *  - endpoint de liste des réservations terminées / annulées sur une période ;
 *  - exposition (ou non) des participants ;
 *  - correspondance d'un joueur par email / téléphone ;
 *  - ANNULATIONS (critique) : vérifier comment l'API expose une annulation faite dans le logiciel
 *    de réservation (statut « annulée » ou réservation supprimée qui disparaît des résultats).
 *    Si elle disparaît, la synchro devra traiter les réservations « disparues » comme annulées ;
 *  - correspondance des statuts Playtomic → BookingStatus ;
 *  - limites de débit et pagination.
 */
export class PlaytomicConnector implements BookingConnector {
  readonly provider = 'PLAYTOMIC' as const;

  async listEndedBookings(
    _club: ConnectorClubConfig,
    _since: Date,
    _until: Date,
  ): Promise<Booking[]> {
    throw new ConnectorNotImplementedError(this.provider, 'listEndedBookings');
  }
  async getBookingParticipants(_club: ConnectorClubConfig, _id: string): Promise<Participant[]> {
    throw new ConnectorNotImplementedError(this.provider, 'getBookingParticipants');
  }
  async matchPlayer(
    _club: ConnectorClubConfig,
    _identity: PlayerIdentity,
  ): Promise<ExternalPlayerRef | null> {
    throw new ConnectorNotImplementedError(this.provider, 'matchPlayer');
  }
}
