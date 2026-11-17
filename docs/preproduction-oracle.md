# Mettre en ligne la préproduction (Oracle Cloud gratuit + domaine OVH)

Durée : environ 45 minutes la première fois. Aucune commande à taper : tout se fait dans les
consoles Oracle, OVH, Brevo et GitHub. **Ne partagez jamais de mot de passe, clé ou secret dans une
conversation** : ils se saisissent uniquement dans les secrets GitHub (étape 4).

Adresses obtenues à la fin :

| Adresse                                   | Usage                                               |
| ----------------------------------------- | --------------------------------------------------- |
| `https://admin.preprod.gpr-padel.fr`      | Back-office (clubs et GPR)                          |
| `https://app.preprod.gpr-padel.fr`        | App joueur, version web (à ouvrir sur le téléphone) |
| `https://api.preprod.gpr-padel.fr/health` | Vérification technique                              |

---

## Étape 1 — Créer le serveur gratuit chez Oracle Cloud

1. Créer un compte sur **cloud.oracle.com** (offre « Free Tier »).
   ⚠ À l'inscription, choisir la **région d'origine France** (_France Central – Paris_ ou _France South – Marseille_) :
   elle ne peut plus être changée ensuite. Une carte bancaire est demandée pour vérifier l'identité ; rien n'est débité
   tant qu'on reste dans les ressources « Always Free ».
2. Menu ☰ → **Compute → Instances → Create instance**.
3. **Name** : `gpr-preprod`.
4. **Image and shape** → _Edit_ :
   - Image : **Canonical Ubuntu 24.04** ;
   - Shape : **Ampere – VM.Standard.A1.Flex**, **2 OCPU et 12 Go** de mémoire (gratuit jusqu'à 4 OCPU / 24 Go).
   - Si Oracle répond « Out of capacity » : réessayer un peu plus tard ou choisir un autre _Availability domain_.
5. **Networking** : laisser _Create new virtual cloud network_ et _Assign a public IPv4 address_ cochés.
6. **Add SSH keys** : choisir **Generate a key pair for me** puis **Save private key**.
   Ranger ce fichier (`ssh-key-….key`) en lieu sûr : c'est la clé d'accès au serveur.
7. **Create**. Quand l'instance est _Running_, noter son **Public IP address** (ex. `141.145.x.x`).

### Ouvrir les ports web (80 et 443)

8. Sur la page de l'instance : **Primary VNIC → Subnet** (lien) → **Security Lists** → la liste par défaut →
   **Add Ingress Rules**, deux fois :
   - Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination port **80** ;
   - Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination port **443**.

(Le pare-feu interne du serveur est ouvert automatiquement lors du déploiement.)

## Étape 2 — Faire pointer les adresses vers le serveur (OVH)

1. Espace client OVHcloud → **Web Cloud → Noms de domaine → gpr-padel.fr → Zone DNS**.
2. **Ajouter une entrée** → type **A**, trois fois, avec l'adresse IP publique du serveur :
   - sous-domaine `api.preprod` → IP du serveur
   - sous-domaine `admin.preprod` → IP du serveur
   - sous-domaine `app.preprod` → IP du serveur
3. La prise en compte prend de quelques minutes à quelques heures.

Facultatif mais utile : créer une redirection email gratuite `tech@gpr-padel.fr` vers votre adresse
(Web Cloud → Emails → Redirections). Elle reçoit les éventuels avis sur les certificats HTTPS.

## Étape 3 — Brevo (emails des codes de connexion)

1. **Expéditeurs, domaines et IP dédiées → Domaines → Ajouter un domaine** : `gpr-padel.fr`.
   Brevo propose de configurer automatiquement la zone DNS OVH, sinon ajouter dans la zone DNS OVH
   les enregistrements qu'il affiche. Attendre le statut **Authentifié**.
2. **Expéditeurs → Ajouter un expéditeur** : nom `GPR`, adresse `no-reply@gpr-padel.fr`.
3. **SMTP et API → onglet SMTP → Générer une nouvelle clé SMTP** (nom : « GPR préproduction »).
   Noter l'**identifiant** (`…@smtp-brevo.com`) et la **clé** (affichée une seule fois).

## Étape 4 — Saisir les 4 secrets dans GitHub

Dépôt `arnaudloubic09-cpu/gpr-app` → **Settings → Secrets and variables → Actions → New repository secret** :

| Nom (exactement)    | Valeur                                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PREPROD_SSH_HOST`  | l'adresse IP publique du serveur (étape 1.7)                                                                                                                               |
| `PREPROD_SSH_KEY`   | le **contenu complet** du fichier de clé privée téléchargé (l'ouvrir avec un éditeur de texte, tout copier, y compris les lignes `-----BEGIN …-----` et `-----END …-----`) |
| `PREPROD_SMTP_USER` | l'identifiant SMTP Brevo                                                                                                                                                   |
| `PREPROD_SMTP_PASS` | la clé SMTP Brevo                                                                                                                                                          |

GitHub chiffre ces valeurs : elles ne sont plus jamais affichées, ni dans le code, ni dans les journaux.
Les autres secrets de l'application (base de données, signature des sessions, chiffrement) sont **générés
automatiquement sur le serveur** au premier déploiement et n'en sortent jamais.

## Étape 5 — Déployer

1. Dépôt GitHub → onglet **Actions** → **Déployer la préproduction** → **Run workflow**.
2. **Email du compte super admin** : votre adresse email (votre compte du back-office).
3. Laisser **Charger les clubs et joueurs de démonstration** coché.
4. **Run workflow**. Le premier déploiement prend 15 à 25 minutes (installation et construction) ;
   les suivants, quelques minutes.
5. Coche verte = c'est en ligne. Les adresses s'affichent dans le résumé du déploiement.

Pour mettre à jour la préproduction plus tard : relancer simplement le même workflow
(laisser l'email vide, le compte existe déjà).

## Étape 6 — Tester

- **Back-office** : `https://admin.preprod.gpr-padel.fr` → votre email → code reçu par email.
  Comptes de démonstration : `admin.toulouse@gpr.example` et `admin.bordeaux@gpr.example`
  (adresses fictives : leurs codes n'arrivent nulle part — créez plutôt de vrais comptes admin club
  dans _Comptes admin_ pour vos testeurs).
- **App joueur** : `https://app.preprod.gpr-padel.fr` sur le téléphone → s'inscrire avec un vrai email.
  Les parties sont simulées tant que Playtomic et Doinsport ne sont pas branchés : créditez des points de test
  depuis le back-office (_Joueurs_ → fiche → _Ajustement manuel_).

## En cas de problème

| Symptôme                                | Cause probable                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Le workflow échoue à « Connexion SSH »  | IP ou clé privée incorrecte dans les secrets ; instance arrêtée                                |
| « L'API ne répond pas encore en HTTPS » | DNS pas encore propagé ou ports 80/443 fermés (étape 1.8) ; relancer le workflow plus tard     |
| Les codes de connexion n'arrivent pas   | Domaine Brevo non authentifié, identifiants SMTP erronés ; regarder les courriers indésirables |

Prévenez Claude avec le message d'erreur affiché dans GitHub (jamais les secrets) pour un diagnostic.
