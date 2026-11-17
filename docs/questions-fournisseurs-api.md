# Questions à poser à Playtomic et à Doinsport (accès API)

À envoyer à chaque fournisseur dès que possible : les réponses conditionnent la phase 6
(branchement des réservations réelles). L'application fonctionne aujourd'hui avec un connecteur
simulé ; seuls les connecteurs `packages/connectors/src/playtomic-connector.ts` et
`doinsport-connector.ts` seront à compléter.

## 1. Accès et cadre contractuel

1. Existe-t-il un programme partenaire / une API pour un **add-on de fidélité** (lecture seule) ?
2. L'accès se fait-il **par club** (chaque club donne son accord) ou **pour un réseau de clubs** ?
3. Coût éventuel, durée d'obtention de l'accès, environnement de **test (sandbox)** disponible ?
4. Documentation officielle : lien, version, politique de changement de version (préavis) ?

## 2. Authentification

5. Type d'authentification (clé API, OAuth 2, autre) ? Identifiants par club ou globaux ?
6. Durée de validité et renouvellement des jetons ?

## 3. Réservations (indispensable au calcul des points)

7. Peut-on lister les réservations d'un club **sur une période** (date de début / de fin) ?
8. Peut-on filtrer les réservations **modifiées depuis** une date (« updated since ») ?
9. Champs disponibles : identifiant unique, terrain, **début et fin**, **statut** ?
10. **Annulations (point critique)** : une réservation annulée dans votre logiciel reste-t-elle visible
    avec un statut « annulée », ou **disparaît-elle** des résultats ? Même question pour une suppression.
11. Les **absences (no-show)** sont-elles signalées ? Comment ?
12. Fuseau horaire des dates renvoyées ?

## 4. Joueurs et participants

13. Les **participants** d'une réservation sont-ils exposés (pas seulement le réservataire) ?
14. Quels identifiants : identifiant joueur stable ? email ? téléphone ?
15. Peut-on **retrouver un joueur par email ou téléphone** (pour relier son compte GPR) ?
    Sous quelles conditions (consentement du joueur, accord du club) ?

## 5. Technique

16. **Webhooks** disponibles (réservation créée / modifiée / annulée) ? Sinon, fréquence d'interrogation conseillée ?
17. Limites de débit (requêtes par minute), pagination ?
18. Disponibilité / engagement de service, contact technique en cas d'incident ?

## 6. RGPD

19. Un **accord de sous-traitance / partage de données** (DPA) est-il nécessaire ? Qui est responsable de traitement ?
20. Où sont hébergées les données (UE) ? Quelles données minimales pouvons-nous recevoir
    (nous ne stockons que : club, début, fin, statut, identifiants des participants) ?
