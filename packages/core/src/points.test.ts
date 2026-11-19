import { describe, expect, it } from 'vitest';
import { computeBookingPoints, isOffPeak } from './points';
import { DEFAULT_GPR_RULES } from './rules';

// Les scénarios détaillés ci-dessous vérifient le calcul avec un multiplicateur ×2 fixé ;
// la valeur par défaut du GPR (×1,5) est vérifiée séparément.
const rules = { ...DEFAULT_GPR_RULES, offPeakMultiplier: 2 };
const PARIS = 'Europe/Paris';

/** Créneau exprimé en heure de Paris. Novembre = UTC+1. */
function slot(day: string, start: string, end: string, offPeakBonusEnabled = true) {
  return {
    startsAt: new Date(`${day}T${start}:00+01:00`),
    endsAt: new Date(`${day}T${end}:00+01:00`),
    timezone: PARIS,
    offPeakBonusEnabled,
  };
}

// 2026-11-18 = mercredi, 2026-11-21 = samedi, 2026-11-22 = dimanche
const WED = '2026-11-18';
const SAT = '2026-11-21';

describe('computeBookingPoints — barème de base (10 points GPR / 30 min)', () => {
  it.each([
    ['60 min', '18:00', '19:00', 20],
    ['90 min', '18:00', '19:30', 30],
    ['120 min', '18:00', '20:00', 40],
    ['75 min → prorata arrondi à l’inférieur', '18:00', '19:15', 25],
    ['20 min', '18:00', '18:20', 6],
  ])('%s', (_, start, end, expected) => {
    const r = computeBookingPoints(slot(WED, start, end), rules);
    expect(r.totalPoints).toBe(expected);
    expect(r.bonusPoints).toBe(0);
  });

  it('renvoie 0 pour un créneau vide ou incohérent', () => {
    expect(computeBookingPoints(slot(WED, '18:00', '18:00'), rules).totalPoints).toBe(0);
    expect(computeBookingPoints(slot(WED, '19:00', '18:00'), rules).totalPoints).toBe(0);
  });
});

describe('computeBookingPoints — heures creuses (×2, lun–ven, avant 12 h et 14 h–17 h)', () => {
  it('double les points d’une partie entièrement en heures creuses le matin', () => {
    const r = computeBookingPoints(slot(WED, '10:00', '11:00'), rules);
    expect(r).toMatchObject({
      basePoints: 20,
      bonusPoints: 20,
      totalPoints: 40,
      offPeakMinutes: 60,
    });
  });

  it('applique le bonus l’après-midi entre 14 h et 17 h', () => {
    expect(computeBookingPoints(slot(WED, '14:00', '15:30'), rules).totalPoints).toBe(60);
  });

  it('partie à cheval 11 h–12 h 30 : bonus au prorata (40 + 10 = 50)', () => {
    const r = computeBookingPoints(slot(WED, '11:00', '12:30'), rules);
    expect(r).toMatchObject({
      offPeakMinutes: 60,
      basePoints: 30,
      bonusPoints: 20,
      totalPoints: 50,
    });
  });

  it('partie à cheval 16 h 30–18 h : 30 min en heures creuses', () => {
    const r = computeBookingPoints(slot(WED, '16:30', '18:00'), rules);
    expect(r).toMatchObject({ offPeakMinutes: 30, totalPoints: 40 });
  });

  it('pas de bonus entre 12 h et 14 h', () => {
    expect(computeBookingPoints(slot(WED, '12:00', '14:00'), rules).bonusPoints).toBe(0);
  });

  it('pas d’heures creuses le week-end', () => {
    expect(computeBookingPoints(slot(SAT, '10:00', '11:00'), rules).totalPoints).toBe(20);
    expect(computeBookingPoints(slot('2026-11-22', '15:00', '16:00'), rules).totalPoints).toBe(20);
  });

  it('pas de bonus si le club ne l’a pas activé', () => {
    expect(computeBookingPoints(slot(WED, '10:00', '11:00', false), rules).totalPoints).toBe(20);
  });

  it('raisonne en heure locale du club (heure d’été, UTC+2)', () => {
    // 09:30 UTC le 17/06/2026 = 11:30 à Paris → 30 min en heures creuses puis 30 min normales
    const r = computeBookingPoints(
      {
        startsAt: new Date('2026-06-17T09:30:00Z'),
        endsAt: new Date('2026-06-17T10:30:00Z'),
        timezone: PARIS,
        offPeakBonusEnabled: true,
      },
      rules,
    );
    expect(r).toMatchObject({ offPeakMinutes: 30, totalPoints: 30 });
  });

  it('supporte un multiplicateur décimal (×1,5) sans erreur d’arrondi', () => {
    const r = computeBookingPoints(slot(WED, '10:00', '11:00'), {
      ...rules,
      offPeakMultiplier: 1.5,
    });
    expect(r.totalPoints).toBe(30);
  });

  it('isOffPeak : borne de fin exclue', () => {
    expect(isOffPeak(new Date(`${WED}T11:59:00+01:00`), PARIS, rules.offPeakWindows)).toBe(true);
    expect(isOffPeak(new Date(`${WED}T12:00:00+01:00`), PARIS, rules.offPeakWindows)).toBe(false);
    expect(isOffPeak(new Date(`${WED}T17:00:00+01:00`), PARIS, rules.offPeakWindows)).toBe(false);
  });
});

import { computeIntervalsPoints, creditableIntervals, mergeIntervals } from './points';
describe('anti-abus : temps de jeu crédité (1 h 30 par jour, chevauchements comptés une fois)', () => {
  const t = (hhmm: string) => new Date(`2026-11-18T${hhmm}:00+01:00`);
  const iv = (a: string, b: string) => ({ start: t(a), end: t(b) });
  const mins = (l: { start: Date; end: Date }[]) =>
    l.reduce((s, i) => s + (i.end.getTime() - i.start.getTime()) / 60_000, 0);

  it('première partie de la journée : entièrement créditée jusqu’à 90 min', () => {
    expect(mins(creditableIntervals(iv('18:00', '19:30'), [], 90))).toBe(90);
    expect(mins(creditableIntervals(iv('18:00', '20:00'), [], 90))).toBe(90);
  });

  it('deuxième partie le même jour : seulement le temps restant sous le plafond', () => {
    expect(mins(creditableIntervals(iv('18:00', '19:00'), [iv('10:00', '11:00')], 90))).toBe(30);
    expect(mins(creditableIntervals(iv('18:00', '19:30'), [iv('10:00', '11:30')], 90))).toBe(0);
  });

  it('inscription sur deux parties en même temps : le chevauchement ne compte qu’une fois', () => {
    expect(mins(creditableIntervals(iv('18:00', '19:30'), [iv('18:00', '19:30')], null))).toBe(0);
    expect(mins(creditableIntervals(iv('18:30', '20:00'), [iv('18:00', '19:00')], null))).toBe(60);
  });

  it('sans plafond configuré : tout le temps non chevauchant est crédité', () => {
    expect(mins(creditableIntervals(iv('18:00', '21:00'), [iv('10:00', '12:00')], null))).toBe(180);
  });

  it('fusion des intervalles', () => {
    expect(
      mergeIntervals([iv('10:00', '11:00'), iv('10:30', '12:00'), iv('14:00', '15:00')]).map((i) =>
        mins([i]),
      ),
    ).toEqual([120, 60]);
  });

  it('points sur la portion créditée (bonus heures creuses conservé)', () => {
    const r = computeIntervalsPoints(
      [iv('11:00', '12:30')],
      { timezone: PARIS, offPeakBonusEnabled: true },
      rules,
    );
    expect(r.totalPoints).toBe(50);
    expect(
      computeIntervalsPoints([], { timezone: PARIS, offPeakBonusEnabled: true }, rules).totalPoints,
    ).toBe(0);
  });
});

describe('valeur par défaut du GPR', () => {
  it('heures creuses ×1,5 : 60 min en heures creuses = 30 points GPR', () => {
    expect(DEFAULT_GPR_RULES.offPeakMultiplier).toBe(1.5);
    const r = computeBookingPoints(slot(WED, '10:00', '11:00'), DEFAULT_GPR_RULES);
    expect(r).toMatchObject({ basePoints: 20, bonusPoints: 10, totalPoints: 30 });
  });
});
