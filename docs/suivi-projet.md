# Suivi du projet GPR : décisions et rappels

Ce fichier recense ce qui reste à faire **avant la mise en production**, et les échéances à ne pas oublier.
Il est mis à jour à chaque étape.

## Avant l'ouverture au public (production)

| #   | Action                                                                                                                                               | Qui                    | Statut                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------- |
| 1   | **Changer d'hébergement** : quitter l'offre gratuite de test pour Scaleway (ou OVHcloud), serveur 2 vCPU / 4 Go + PostgreSQL managé avec sauvegardes | GPR + Claude           | À faire au moment de la mise en ligne |
| 2   | Connecteurs Playtomic et Doinsport (documentation officielle des API, voir `questions-fournisseurs-api.md`)                                          | GPR (demande) + Claude | En attente de la documentation        |
| 3   | Conditions d'utilisation, politique de confidentialité (URL publique), CGV pour la carte VIP payante                                                 | GPR (juriste)          | À faire                               |
| 4   | Comptes Apple Developer, Google Play Console, Expo (publication de l'app et notifications push)                                                      | GPR                    | À faire                               |
| 5   | Brevo : domaine d'envoi authentifié ; passer à une offre adaptée au volume de production                                                             | GPR                    | Compte créé                           |
| 6   | Compte de paiement Stripe au nom du GPR (vente en ligne de la carte VIP)                                                                             | GPR                    | Quand les partenariats seront prêts   |
| 7   | Accords de sous-traitance (DPA) avec l'hébergeur et Brevo ; registre des traitements RGPD                                                            | GPR                    | À faire                               |
| 8   | Validation en préproduction par au moins un club (parcours complet)                                                                                  | GPR + clubs            | Après la mise en ligne des tests      |
| 9   | Sauvegardes de production activées **et** restauration testée                                                                                        | Claude                 | À la mise en production               |

## Préproduction (tests)

- Hébergement : **VPS OVH** (2 vCore, 4 Go RAM, 40 Go NVMe, sauvegarde quotidienne) ; domaine **gpr-padel.fr** chez OVH ; emails **Brevo**.
- Adresses : `admin.preprod.gpr-padel.fr`, `app.preprod.gpr-padel.fr` (app web), `api.preprod.gpr-padel.fr`.
- Mise en ligne et mises à jour : GitHub → Actions → **Déployer la préproduction** (guide : `preproduction.md`).

La checklist technique détaillée est dans `mise-en-production.md`, section 8.

## Échéances

| Échéance                         | Détail                                                                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renouvellement du nom de domaine | Acheté pour 3 ans : **activer le renouvellement automatique** chez le registraire, ou noter la date d'expiration ici. Un domaine expiré coupe l'app, le back-office et les emails. |
| Clé SMTP Brevo                   | À régénérer en cas de départ d'une personne qui y avait accès.                                                                                                                     |
| Hébergement de test gratuit      | Vérifier les limites de l'offre (mise en veille, durée d'essai, suppression des données inactives).                                                                                |

## Décisions prises (résumé)

- Points : 10 points GPR par 30 min, au prorata, heures creuses ×2 (lun.–ven., avant 12 h et 14 h–17 h) si le club l'active, pas de plafond, expiration à 12 mois.
- Pas de rétroactivité : seules les parties jouées après la liaison du compte comptent.
- Coupons valables 7 jours, remboursés automatiquement s'ils ne sont pas utilisés.
- Niveaux Bronze / Argent (500) / Or (1 500) / Platine (3 000) sur 12 mois ; avantages par niveau définis par chaque club.
- Carte VIP : gratuite au niveau Platine (1 an) ou 60 € par an ; codes partenaires ; **désactivée** jusqu'à la signature des partenariats.
- Suppression de compte avec 30 jours de rétractation.
