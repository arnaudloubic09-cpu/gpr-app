import type { BookingStatus } from '@gpr/core';
import type { BookingConnector } from './booking-connector';
import type {
  Booking,
  ConnectorClubConfig,
  ExternalPlayerRef,
  Participant,
  PlayerIdentity,
} from './types';

/**
 * Connecteur simulé : génère des réservations réalistes et DÉTERMINISTES
 * (mêmes identifiants et mêmes statuts à chaque appel), pour le développement et les tests.
 *
 * - 4 terrains, créneaux de 60 ou 90 min entre 8 h et 23 h, taux d'occupation variable ;
 * - environ 85 % terminées, 8 % annulées, 4 % absences, 3 % sans participants exposés ;
 * - joueurs « mock-player-1 » à « mock-player-30 » (liés aux comptes de démo) et quelques invités inconnus.
 */
export interface MockConnectorOptions {
  courts?: number;
  playerCount?: number;
  /** Forçage du statut de certaines réservations (scénarios de test : annulation tardive…). */
  statusOverrides?: Record<string, BookingStatus>;
}

const SLOT_STARTS = [
  '08:00',
  '09:30',
  '11:00',
  '12:30',
  '14:00',
  '15:30',
  '17:00',
  '18:30',
  '20:00',
  '21:30',
];

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Décalage Europe/Paris en minutes à une date donnée (heure d'hiver/été). */
function parisOffsetMinutes(date: Date): number {
  const local = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((local.getTime() - utc.getTime()) / 60_000);
}

export class MockConnector implements BookingConnector {
  readonly provider = 'MOCK' as const;
  private readonly courts: number;
  private readonly playerCount: number;
  private readonly overrides: Record<string, BookingStatus>;

  constructor(options: MockConnectorOptions = {}) {
    this.courts = options.courts ?? 4;
    this.playerCount = options.playerCount ?? 30;
    this.overrides = options.statusOverrides ?? {};
  }

  private bookingsForDay(
    externalClubId: string,
    day: string,
  ): (Booking & { participants: Participant[] })[] {
    const out: (Booking & { participants: Participant[] })[] = [];
    for (let court = 1; court <= this.courts; court++) {
      for (const start of SLOT_STARTS) {
        const externalId = `${externalClubId}-${day}-c${court}-${start.replace(':', '')}`;
        const r = rng(externalId);
        if (r() > 0.55) continue; // créneau libre

        const [h, m] = start.split(':').map(Number);
        const noonUtc = new Date(`${day}T12:00:00Z`);
        const startsAt = new Date(
          Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), h, m) -
            parisOffsetMinutes(noonUtc) * 60_000,
        );
        const duration = r() < 0.7 ? 90 : 60;
        const endsAt = new Date(startsAt.getTime() + duration * 60_000);

        const roll = r();
        const status: BookingStatus =
          roll < 0.08 ? 'CANCELLED' : roll < 0.12 ? 'NO_SHOW' : 'COMPLETED';

        const players = new Set<string>();
        while (players.size < 4) {
          players.add(
            r() < 0.1
              ? `mock-guest-${Math.floor(r() * 1000)}`
              : `mock-player-${1 + Math.floor(r() * this.playerCount)}`,
          );
        }
        const list = [...players];
        const hideParticipants = r() < 0.03;

        out.push({
          provider: 'MOCK',
          externalId,
          externalClubId,
          startsAt,
          endsAt,
          status: this.overrides[externalId] ?? status,
          bookerExternalId: list[0],
          participants: hideParticipants
            ? []
            : list.map((externalPlayerId) => ({ externalPlayerId })),
        });
      }
    }
    return out;
  }

  private daysBetween(since: Date, until: Date): string[] {
    const days: string[] = [];
    const d = new Date(
      Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate() - 1),
    );
    while (d <= until) {
      days.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return days;
  }

  async listEndedBookings(club: ConnectorClubConfig, since: Date, until: Date): Promise<Booking[]> {
    return this.daysBetween(since, until)
      .flatMap((day) => this.bookingsForDay(club.externalClubId, day))
      .filter((b) => b.endsAt > since && b.endsAt <= until)
      .map(({ participants: _p, ...booking }) => booking);
  }

  async getBookingParticipants(
    club: ConnectorClubConfig,
    bookingExternalId: string,
  ): Promise<Participant[]> {
    const day = bookingExternalId.slice(
      club.externalClubId.length + 1,
      club.externalClubId.length + 11,
    );
    return (
      this.bookingsForDay(club.externalClubId, day).find((b) => b.externalId === bookingExternalId)
        ?.participants ?? []
    );
  }

  /** Comptes de démo : joueurNN@gpr.example ↔ mock-player-NN. */
  async matchPlayer(
    _club: ConnectorClubConfig,
    identity: PlayerIdentity,
  ): Promise<ExternalPlayerRef | null> {
    const match = identity.email?.toLowerCase().match(/^joueur(\d{2})@gpr\.example$/);
    if (!match) return null;
    const n = Number(match[1]);
    return n >= 1 && n <= this.playerCount
      ? { provider: 'MOCK', externalPlayerId: `mock-player-${n}` }
      : null;
  }
}
