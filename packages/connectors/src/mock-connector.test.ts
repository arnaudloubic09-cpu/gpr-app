import { describe, expect, it } from 'vitest';
import { MockConnector } from './mock-connector';

const club = { externalClubId: 'mock-club', credentials: {} };
const since = new Date('2026-11-01T00:00:00Z');
const until = new Date('2026-11-15T00:00:00Z');

describe('MockConnector', () => {
  it('est déterministe (mêmes réservations à chaque appel)', async () => {
    const a = await new MockConnector().listEndedBookings(club, since, until);
    const b = await new MockConnector().listEndedBookings(club, since, until);
    expect(a.length).toBeGreaterThan(50);
    expect(b).toEqual(a);
  });

  it('ne renvoie que des créneaux terminés dans la période', async () => {
    const list = await new MockConnector().listEndedBookings(club, since, until);
    expect(list.every((x) => x.endsAt > since && x.endsAt <= until && x.endsAt > x.startsAt)).toBe(
      true,
    );
  });

  it('produit un mélange réaliste de statuts', async () => {
    const list = await new MockConnector().listEndedBookings(club, since, until);
    const count = (s: string) => list.filter((x) => x.status === s).length;
    expect(count('COMPLETED')).toBeGreaterThan(count('CANCELLED'));
    expect(count('CANCELLED')).toBeGreaterThan(0);
    expect(count('NO_SHOW')).toBeGreaterThan(0);
  });

  it('expose les participants de façon cohérente avec la liste', async () => {
    const connector = new MockConnector();
    const [first] = await connector.listEndedBookings(club, since, until);
    const participants = await connector.getBookingParticipants(club, first.externalId);
    expect(participants.length === 0 || participants.length === 4).toBe(true);
  });

  it('permet de forcer un statut (annulation tardive)', async () => {
    const [first] = await new MockConnector().listEndedBookings(club, since, until);
    const forced = new MockConnector({ statusOverrides: { [first.externalId]: 'CANCELLED' } });
    const again = await forced.listEndedBookings(club, since, until);
    expect(again.find((x) => x.externalId === first.externalId)!.status).toBe('CANCELLED');
  });

  it('associe les comptes de démo par email', async () => {
    const c = new MockConnector();
    expect(await c.matchPlayer(club, { email: 'joueur07@gpr.example' })).toEqual({
      provider: 'MOCK',
      externalPlayerId: 'mock-player-7',
    });
    expect(await c.matchPlayer(club, { email: 'inconnu@example.com' })).toBeNull();
  });
});
