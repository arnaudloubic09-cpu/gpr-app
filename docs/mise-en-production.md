# Mise en production de l'application GPR

Ce guide décrit comment mettre en ligne une **préproduction** (pour valider avec quelques clubs) puis la
**production**. Les deux environnements sont identiques ; seules les variables changent.

## 1. Vue d'ensemble

| Élément                   | Rôle                                             | Hébergement recommandé                         |
| ------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| **API** (NestJS)          | Cœur métier, synchronisations, tâches planifiées | Conteneur Docker (`apps/api/Dockerfile`)       |
| **Back-office** (Next.js) | Espace clubs et super admin                      | Conteneur Docker (`apps/admin/Dockerfile`)     |
| **PostgreSQL 16**         | Données (ledger, comptes, coupons…)              | **Base managée** avec sauvegardes automatiques |
| **Redis 7**               | File des tâches planifiées                       | Conteneur (persistance AOF) ou Redis managé    |
| **Emails**                | Codes de connexion, alertes, exports RGPD        | Fournisseur transactionnel (SMTP)              |
| **App mobile**            | iOS / Android                                    | Expo EAS → App Store / Google Play             |

Toutes les données doivent rester **dans l'Union européenne** (RGPD) : choisir des régions UE et signer
les accords de sous-traitance (DPA) proposés par chaque fournisseur.

## 2. Hébergeur : deux options

**Option A — recommandée pour démarrer : un serveur + base managée (Scaleway ou OVHcloud, France)**

- 1 serveur virtuel (2 vCPU, 4 Go RAM suffisent au lancement) avec Docker ;
- 1 base PostgreSQL managée (sauvegardes quotidiennes et restauration à un instant donné) ;
- déploiement avec `deploy/docker-compose.yml` (Caddy fournit le HTTPS automatiquement).
- Coût indicatif modeste ; tout reste sous votre contrôle.

**Option B — plateforme managée (Clever Cloud, France)**

- Pas de serveur à administrer : on pousse les images, la plateforme gère HTTPS, redémarrages, mises à l'échelle ;
- PostgreSQL et Redis proposés en add-ons managés ;
- un peu plus cher, mais moins de maintenance.

Les mêmes images Docker fonctionnent dans les deux cas.

## 3. Préparer un environnement (préproduction puis production)

1. **Nom de domaine** : par exemple `api.preprod.<domaine>` et `admin.preprod.<domaine>`
   (puis `api.<domaine>` / `admin.<domaine>`), enregistrements DNS vers le serveur.
2. **Emails** : créer un compte chez un fournisseur transactionnel (ex. Brevo, français), vérifier le
   domaine d'envoi (SPF, DKIM, DMARC) et récupérer les identifiants SMTP.
3. **Variables** : copier `deploy/env.example` en `deploy/.env` sur le serveur et le remplir.
   Générer des secrets **différents** pour la préproduction et la production.
   ⚠ Conserver `CONNECTOR_ENCRYPTION_KEY` dans un coffre-fort : sans elle, les identifiants des connecteurs
   enregistrés deviennent illisibles.
4. **Démarrer** :
   ```bash
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env run --rm api npx prisma migrate deploy
   ```
5. **Premier compte super admin** (une seule fois) : créer l'utilisateur en base
   (`role = SUPER_ADMIN`), puis créer les clubs et les admins club depuis le back-office.
   Ne pas lancer le jeu de données de démonstration (`seed`) en production.
6. **Vérifier** : `https://api.<domaine>/health` doit répondre `{"status":"ok","database":"up"}`.

L'API refuse de démarrer en production si la configuration est incomplète (CORS, fournisseur d'emails,
secrets par défaut) : le message indique la variable à corriger.

## 4. Mettre à jour l'application

1. Chaque modification poussée sur GitHub est vérifiée par la **CI** (types, 200+ tests, builds, images Docker).
2. On valide d'abord en **préproduction**, puis on déploie la même version en production :
   ```bash
   git pull
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env run --rm api npx prisma migrate deploy
   ```
3. Les migrations de base de données sont versionnées et appliquées sans perte de données.
4. App mobile : les corrections d'écran partent en **mise à jour instantanée** (EAS Update) ; les
   changements natifs nécessitent une nouvelle version sur les stores.

## 5. Sauvegardes et reprise

- **Base managée** : activer les sauvegardes quotidiennes + restauration à un instant donné (PITR), rétention ≥ 30 jours.
- **Base sur le serveur** (sinon) : planifier `deploy/backup.sh` chaque nuit et copier les fichiers vers un
  stockage objet dans l'UE.
- **Tester une restauration** au moins une fois avant l'ouverture, puis chaque trimestre.
- Redis ne contient que la file des tâches (recréée automatiquement au démarrage) : pas de sauvegarde nécessaire.
- Relancer une tâche après incident (gamification, expire, coupons-expire, gdpr-deletions, vip) :
  `docker compose -f deploy/docker-compose.yml --env-file deploy/.env run --rm api node dist/cli/run-job.js gamification`.

## 6. Supervision

- **Disponibilité** : un service de surveillance (ex. UptimeRobot, Better Uptime) qui interroge `/health`
  chaque minute et prévient par email / SMS.
- **Synchronisations** : alerte email automatique aux super admins après 3 échecs consécutifs d'un club ;
  état visible dans _Clubs et connecteurs_.
- **Erreurs applicatives** : brancher un outil de suivi d'erreurs hébergé dans l'UE (ex. Sentry région UE)
  si souhaité.
- **Journal d'audit** : consultable dans le back-office (qui a fait quoi).

## 7. Publier l'app mobile

Comptes nécessaires (au nom du GPR) : **Apple Developer** (99 $/an), **Google Play Console** (25 $ une fois),
**Expo** (gratuit pour démarrer).

1. `npx eas init` dans `apps/mobile` (renseigne `extra.eas.projectId` dans `app.json`) ;
2. Mettre à jour les adresses d'API dans `apps/mobile/eas.json` (profils `preview` et `production`) ;
3. Préproduction : `npx eas build --profile preview` → installation sur les téléphones des testeurs ;
4. Production : `npx eas build --profile production` puis `npx eas submit` (TestFlight puis App Store,
   test interne puis Google Play) ;
5. Notifications push : configurer les clés APNs (Apple) et FCM (Google) dans Expo, puis `PUSH_PROVIDER=expo`.

Prévoir pour les stores : nom, icône, captures d'écran, description, **politique de confidentialité
(URL publique)**, formulaire de confidentialité des données (Apple / Google).

## 8. Checklist avant ouverture

- [ ] Conditions d'utilisation et politique de confidentialité rédigées et publiées (URL)
- [ ] Registre des traitements RGPD et DPA signés avec les hébergeurs et le fournisseur d'emails
- [ ] Préproduction validée par au moins un club (connexion, partie, points, échange, coupon au comptoir)
- [ ] Sauvegardes activées **et** restauration testée
- [ ] Surveillance `/health` en place
- [ ] Secrets de production générés et stockés dans un coffre-fort
- [ ] Comptes admin des clubs créés ; affiches d'inscription (QR vers l'app) dans les clubs
- [ ] Connecteurs Playtomic / Doinsport branchés (phase 6) — sinon, rester en préproduction
- [ ] Carte VIP : laissée désactivée jusqu'à la signature des partenariats
