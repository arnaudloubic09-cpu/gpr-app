# GPR — Programme de fidélité padel

Add-on de fidélité pour un groupement de clubs de padel (Playtomic / Doinsport) : les joueurs
cumulent des points GPR selon leur temps de jeu et les échangent contre des avantages proposés par chaque club.

## Structure

```
apps/api         NestJS + Prisma + PostgreSQL (port 3000)
apps/admin       Back-office Next.js — admin club & super admin (port 3001)
apps/mobile      App joueur Expo (iOS / Android)
packages/core    Types, enums, règles GPR par défaut, validation des récompenses
packages/connectors  Interface BookingConnector (mock en phase 2, Playtomic/Doinsport en phase 6)
```

## Démarrage

Prérequis : Node 22+, pnpm 10+, Docker.

```bash
pnpm install
cp .env.example apps/api/.env          # puis générer les secrets (commandes dans le fichier)
pnpm db:up                             # Postgres, Redis, Mailpit
pnpm build:packages
pnpm db:migrate                        # applique les migrations
pnpm db:seed                           # 2 clubs, 30 joueurs, admins, catalogue
pnpm dev:api                           # http://localhost:3000/health
pnpm dev:admin                         # http://localhost:3001
pnpm dev:mobile                        # Expo
```

Les codes de connexion (OTP) envoyés en développement sont lisibles dans **Mailpit : http://localhost:8025**.

### Comptes de démonstration

| Compte                     | Email                                           | Espace      |
| -------------------------- | ----------------------------------------------- | ----------- |
| Super admin GPR            | `superadmin@gpr.example`                        | back-office |
| Admin Padel Arena Toulouse | `admin.toulouse@gpr.example`                    | back-office |
| Admin Smash Club Bordeaux  | `admin.bordeaux@gpr.example`                    | back-office |
| Joueurs                    | `joueur01@gpr.example` … `joueur30@gpr.example` | app mobile  |

## Moteur de points GPR (phase 2)

- **Barème** : 10 points GPR par 30 min, au prorata (75 min = 25 points GPR), sans plafond journalier.
- **Heures creuses** : lun–ven avant 12 h et 14 h–17 h (heure locale du club), points ×2 au prorata des minutes,
  si le club a activé le bonus. Le bonus est une écriture distincte (`BONUS`) pour les statistiques.
- **Crédit** : participants identifiés (à défaut, le réservataire), points « en attente » jusqu'à H+2.
  Pas de rétroactivité : seules les parties terminées après la liaison du compte comptent.
- **Annulation / absence** : 0 point ; si déjà crédité, écriture `REVERSAL`.
- **Expiration** : 12 mois après le gain, en FIFO (tâche quotidienne à 3 h 15).
- **Synchronisation** : BullMQ, selon la fréquence de chaque club ; idempotente ; relance manuelle
  `POST /clubs/:id/sync` (super admin) ; historique `GET /clubs/:id/sync-runs`.
- **Joueur** : `GET /me/balance`, `GET /me/transactions`.

## Tests

```bash
pnpm test        # tests unitaires + intégration (base gpr_test créée par docker compose)
pnpm typecheck
```

## Règles et garanties clés

- **Comptes séparés** : joueur (app mobile), admin club (son club uniquement), super admin (tout le groupement).
- **Ledger immuable** : triggers PostgreSQL bloquant `UPDATE` / `DELETE` / `TRUNCATE` ; le solde est toujours
  calculé ; le statut « en attente / validé » est déduit de `availableAt` (H+2).
- **Pas de points contre une partie de padel** : aucune catégorie correspondante dans l'enum, contrainte CHECK
  et validation serveur. Les cours ne sont autorisés **qu'en réduction**, jamais gratuits.
- **Règles GPR communes** (barème, plafond, expiration, heures creuses : avant 12 h et 14 h–17 h, ×2) définies par
  le super admin et versionnées ; chaque club active ou non le bonus heures creuses et gère son catalogue.
- **Sécurité** : OTP haché avec essais et demandes limités, refresh tokens à rotation avec détection de rejeu,
  jetons du back-office en cookies httpOnly, identifiants connecteurs chiffrés AES-256-GCM, journal d'audit immuable.
