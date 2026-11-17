import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLOBAL_SCHEDULES } from './jobs.service';

/** Garde-fou : chaque tâche planifiée est bien traitée, et inversement. */
describe('Planification des tâches', () => {
  const source = readFileSync(join(__dirname, 'jobs.service.ts'), 'utf8');

  it('prévoit les quatre tâches globales attendues', () => {
    expect(Object.keys(GLOBAL_SCHEDULES).sort()).toEqual([
      'coupons-expire',
      'expire',
      'gamification',
      'gdpr-deletions',
    ]);
  });

  it.each(Object.keys(GLOBAL_SCHEDULES))('la tâche « %s » a un traitement', (name) => {
    expect(source).toContain(`case '${name}':`);
  });
});
