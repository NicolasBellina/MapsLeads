# Fiche Chrome Web Store — MapsLeads

Textes à copier-coller dans la console développeur. Chaque section indique le
champ correspondant et la limite de caractères imposée par Google.

---

## 1. Nom de l'extension (75 caractères max)

```
MapsLeads — Leads entreprises SIRENE
```

35 caractères. Voir l'avertissement en fin de document au sujet de ce nom.

---

## 2. Description courte (132 caractères max)

C'est le champ `description` du `manifest.json`. Il apparaît sous le nom dans
les résultats de recherche du store.

```
Trouvez des prospects par métier et par ville dans la base SIRENE de l'INSEE. Export Excel et suivi d'appels intégré.
```

115 caractères.

---

## 3. Description détaillée (16 000 caractères max)

```
MapsLeads transforme la base SIRENE de l'INSEE en liste de prospection exploitable. Vous saisissez une activité et une ville, vous obtenez les entreprises réellement implantées à cette adresse, prêtes à être appelées et exportées.

■ UN CIBLAGE SUR L'ACTIVITÉ RÉELLE

Sur un annuaire classique, chercher un métier remonte les sociétés dont le nom contient ce mot. MapsLeads procède autrement : votre saisie est d'abord traduite en code d'activité officiel (NAF), puis la base est interrogée sur ce code. Vous obtenez donc les entreprises dont c'est l'activité déclarée, y compris celles dont la raison sociale ne l'indique pas.

La correspondance couvre les principales activités déclarées par les très petites entreprises françaises. Au total, 732 codes d'activité officiels sont interrogeables.

■ UN CIBLAGE GÉOGRAPHIQUE EXACT

Saisissez une ville, un département ou un code postal. Le nom de commune est converti en code INSEE officiel avant l'interrogation : une recherche sur Tours ne remonte pas d'établissement parisien. Les trois villes à arrondissements sont gérées correctement. L'ensemble des communes françaises est couvert.

■ UN SCORE D'OPPORTUNITÉ

Chaque résultat reçoit une note sur 100, calculée à partir de sa date de création et de sa tranche d'effectif. Les structures récentes et de petite taille remontent en tête : ce sont celles qui n'ont pas encore de prestataire en place et qui décident vite. Le tri par date de création ou par ordre alphabétique reste disponible.

■ UNE SESSION D'APPELS INTÉGRÉE

Ouvrez vos résultats dans un onglet dédié et menez votre campagne sans changer d'outil. Chaque fiche accepte un statut d'appel parmi cinq, une note libre et une date de rappel. Un tableau de bord affiche le nombre d'appels passés, le taux de conversion et la répartition par statut. Deux affichages sont proposés : une liste détaillée et un tableau Kanban avec glisser-déposer.

■ UN EXPORT EXCEL DIRECTEMENT UTILISABLE

Un vrai fichier .xlsx, pas un CSV renommé : en-tête figée, filtres automatiques, largeurs de colonnes calibrées. Il s'ouvre dans Excel, Numbers ou Google Sheets sans mise en forme à refaire.

Le fichier reprend l'identité de chaque établissement, son activité, son adresse complète, son numéro SIRET, sa tranche d'effectif, sa date de création et son score. Deux colonnes vides sont prévues pour votre propre saisie.

■ CE QUE L'EXTENSION NE FAIT PAS

Soyons clairs pour éviter toute déception. La base SIRENE est un registre administratif : elle ne contient aucune coordonnée de contact direct. MapsLeads ne fournit donc ni numéro de téléphone, ni adresse e-mail, ni site web. Vous obtenez l'identité de l'entreprise, son activité et son adresse postale.

L'extension ne lit, ne modifie et n'analyse aucune page web. Elle ne s'injecte dans aucun onglet et n'observe pas votre navigation.

■ VOS DONNÉES RESTENT SUR VOTRE MACHINE

Les résultats, les statuts d'appel et les notes sont enregistrés uniquement dans le stockage local de votre navigateur. Rien n'est transmis à un serveur MapsLeads, pour la simple raison qu'il n'en existe aucun. La version gratuite ne demande la création d'aucun compte.

■ SOURCE DES DONNÉES

API Recherche d'entreprises (annuaire-entreprises.data.gouv.fr), alimentée par la base SIRENE de l'INSEE. Données publiques officielles, mises à jour en continu par l'administration française. La résolution des communes s'appuie sur l'API Découpage administratif (geo.api.gouv.fr).

■ VERSION GRATUITE ET VERSION PREMIUM

La version gratuite autorise un nombre illimité de recherches et trois exports Excel de vingt lignes. La version Premium lève ces deux limites et ouvre la session d'appels complète.

■ POUR QUI

Pour celles et ceux qui construisent leurs listes d'appels à la main plutôt que d'acheter des fichiers tout faits. Le périmètre couvert est la France.
```

---

## 4. Catégorie et langue

- **Catégorie** : Outils de travail (Workflow & Planning)
- **Langue** : Français

---

## 5. Objectif unique de l'extension

Champ « Single purpose » du formulaire de conformité. Google rejette les
formulations vagues.

```
MapsLeads a une seule finalité : rechercher des entreprises dans la base SIRENE de l'INSEE selon un métier et une localisation, puis présenter les résultats sous forme de liste de prospection exportable en Excel avec un suivi d'appels. Toutes les fonctionnalités de l'extension servent cet objectif unique.
```

---

## 6. Justification des permissions

À remplir champ par champ. C'est la section qui provoque le plus de refus.

### Permission `storage`

```
Stocke localement les résultats de recherche, les statuts d'appel, les notes de prospection et les dates de rappel saisis par l'utilisateur, ainsi que le compteur d'exports gratuits et le cache des codes communes déjà résolus. Sans cette permission, l'utilisateur perdrait son travail à chaque fermeture du popup et la session d'appels serait impossible. Aucune de ces données ne quitte le navigateur.
```

### Accès à `https://recherche-entreprises.api.gouv.fr/*`

```
API publique de l'administration française donnant accès à la base SIRENE de l'INSEE. C'est la source unique des entreprises affichées par l'extension. Seuls le métier et la zone géographique saisis par l'utilisateur sont envoyés, dans l'URL de requête. Aucune donnée personnelle n'est transmise.
```

### Accès à `https://geo.api.gouv.fr/*`

```
API publique de l'administration française (Découpage administratif). Convertit le nom de commune saisi par l'utilisateur en code INSEE officiel, indispensable pour filtrer géographiquement les résultats. Seul le nom de commune est envoyé. Le résultat est mis en cache localement pour limiter les appels.
```

### Accès à `https://api.lemonsqueezy.com/v1/licenses/*`

```
Vérifie la validité de la clé de licence saisie par un utilisateur ayant souscrit à l'offre Premium. Seule la clé de licence est transmise, uniquement lorsque l'utilisateur clique sur « Activer ». Les utilisateurs de la version gratuite ne déclenchent jamais cet appel.
```

---

## 7. Déclaration d'usage des données

Onglet « Confidentialité » de la console.

| Catégorie | À déclarer |
|---|---|
| Informations permettant d'identifier personnellement | Non |
| Informations sur la santé | Non |
| Informations financières et de paiement | Non (le paiement est traité hors extension) |
| Authentification | Non |
| Communications personnelles | Non |
| Position | Non |
| Historique de navigation | Non |
| Activité utilisateur | Non |
| Contenu de sites web | Non |

Cocher les trois attestations :
- Je ne vends pas les données des utilisateurs à des tiers.
- Je n'utilise ni ne transfère les données à des fins étrangères à la fonctionnalité principale.
- Je n'utilise ni ne transfère les données pour évaluer la solvabilité ou accorder des prêts.

**Une URL de politique de confidentialité est obligatoire** dès lors que
l'extension propose une offre payante. Elle doit être en ligne avant la
soumission.

---

## 8. Historique des refus

### Refus du 5 septembre 2026 — « Spam dans les mots clés » (Yellow Argon)

Motif cité par Google, mot pour mot :

> French: "plombier, coiffeur, restaurant, garage, boulangerie, avocat,
> architecte, agence immobilière, kinésithérapeute, paysagiste"

Cette énumération figurait dans la première version de la description détaillée,
pour illustrer les 131 métiers reconnus. Dix noms de métiers alignés séparés par
des virgules correspondent exactement au motif que le détecteur de spam de
Google recherche, même quand ils décrivent honnêtement le produit.

Corrigé dans la version ci-dessus : plus aucune énumération de métiers. Le
chiffre de 131 métiers a été retiré au profit du seul volume de codes d'activité,
qui est vérifiable et ne se prête pas à l'accusation de bourrage.

Règle à conserver pour toute modification future de la fiche : ne jamais aligner
plus de trois termes séparés par des virgules, et ne jamais citer une liste de
métiers ou de secteurs cibles.

---

## 9. Trois points à régler avant de soumettre

### Le nom est un risque de refus

« MapsLeads » et l'icône en forme de punaise cartographique évoquent Google
Maps. L'extension n'a plus aucun rapport avec Google Maps : elle interroge
uniquement des API de l'administration française. Google refuse les extensions
dont le nom ou l'iconographie suggèrent un lien avec un service qu'elles
n'utilisent pas.

Ma recommandation : renommer en quelque chose qui dit ce que fait le produit,
par exemple « SireneLeads », « Prospect SIRENE » ou « LeadsFR ». Si vous gardez
MapsLeads, le sous-titre « Leads entreprises SIRENE » réduit le risque sans
l'annuler.

### L'offre Premium ne fonctionne pas

Le bouton d'essai ouvre un lien de paiement Stripe, mais l'extension valide les
clés auprès de l'API LemonSqueezy. Un acheteur Stripe ne reçoit donc aucune clé
que l'extension accepte. Si un examinateur teste le parcours d'achat, c'est un
refus pour fonctionnalité annoncée non fonctionnelle.

Options : brancher la validation sur Stripe, ou retirer la mention Premium de la
fiche et publier d'abord une version entièrement gratuite.

### Les clés beta doivent disparaître

`src/lib/config.js` contient `BETA_KEYS` : des clés en dur qui débloquent le
Premium pour quiconque lit le code de l'extension, lisible par tous une fois
publiée. Le secret de signature `SIGNED_SECRET` est également en clair.
