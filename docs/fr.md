# Seafile

[Seafile](https://www.seafile.com/) est un service de stockage et de
synchronisation de fichiers auto-hébergé : vos bibliothèques vivent sur votre
serveur, les applications de bureau et mobiles les gardent synchronisées. Cette
intégration amène un compte Seafile dans Gladys : l'espace utilisé et le quota,
les bibliothèques, les appareils liés, et un déclencheur de scène **quand une
bibliothèque est modifiée** (un fichier ajouté, modifié ou supprimé), avec qui
l'a modifiée. Elle prévient aussi quand le quota dépasse un seuil, et un widget
du tableau de bord montre le quota et les dernières bibliothèques modifiées.
Pour un administrateur, un second appareil suit tout le serveur.

Testée avec un vrai Seafile Server CE 12.0 (image Docker
`seafileltd/seafile-mc` avec MariaDB et memcached) : un compte ordinaire avec
quota, un administrateur, des bibliothèques à lui, partagées et de groupe, des
fichiers déposés, le quota modifié, un client de bureau lié, un mauvais mot de
passe. Pas encore testée sur un vrai Gladys : vos retours sont les bienvenus
dans [les issues](https://github.com/guim31/gladys-seafile/issues).

## Ce qu'il faut

- Gladys Assistant 5.1.0 ou plus récent.
- Seafile Server (édition Community ou Professional, version 11 ou plus),
  joignable depuis la machine de Gladys à l'adresse de son interface web.
- Un compte Seafile : son e-mail (ou identifiant) et son mot de passe, ou un
  **jeton d'API** si le compte utilise la double authentification. Un compte
  administrateur ajoute l'appareil serveur ; un compte ordinaire suffit pour le
  reste.

L'intégration lit Seafile chaque minute par défaut : quatre requêtes légères
sur votre réseau (compte, bibliothèques, appareils liés, et les chiffres du
serveur pour un administrateur).

## Mise en route

### 1. Configurer l'intégration

Dans Gladys, ouvrez **Intégrations → Seafile → Configuration** et remplissez :

- **Adresse de Seafile** : l'adresse de l'interface web, comme dans votre
  navigateur, ex. `http://192.168.1.2:8000` ou `https://cloud.example.com`. Un
  lien copié depuis la page d'une bibliothèque convient aussi.
- **E-mail ou identifiant** et **Mot de passe** du compte.
- **Jeton d'API** (facultatif) : à la place du mot de passe, nécessaire quand
  la double authentification est active. Pour en obtenir un, lancez sur
  n'importe quel ordinateur
  `curl -d username=EMAIL -d password=MOTDEPASSE -H "X-SEAFILE-OTP: CODE" https://cloud.example.com/api2/auth-token/`
  (`CODE` est le code du moment de votre application d'authentification) et
  copiez le `token` de la réponse.
- **Fréquence de lecture** : de 30 secondes à 15 minutes. C'est aussi le délai
  du déclencheur « Une bibliothèque est modifiée ».
- **Seuil d'alerte de quota** : de 70 à 95 %.
- **Langue des noms** : la langue des noms des fonctionnalités et des textes
  envoyés par l'intégration.

Cliquez ensuite sur **Tester la connexion** : la réponse donne la version de
Seafile, le compte, l'espace utilisé et le nombre de bibliothèques.

### 2. Ajouter les appareils

Ouvrez l'onglet **Découverte** : le compte y figure, et le serveur aussi pour un
administrateur. Ajoutez ceux que vous voulez suivre.

## Les appareils

**Le compte** (`Seafile <nom>`) :

| Fonctionnalité                 | Signification                                             |
| ------------------------------ | --------------------------------------------------------- |
| En ligne                       | 1 tant que Seafile répond, 0 sinon                        |
| Quota utilisé                  | pourcentage du quota utilisé (0 sans quota)               |
| Espace utilisé                 | espace utilisé par le compte, en Mo                       |
| Quota                          | le quota du compte, en Mo (rien sans quota)               |
| Mes bibliothèques              | bibliothèques dont le compte est propriétaire             |
| Bibliothèques partagées        | bibliothèques partagées avec le compte, ou de ses groupes |
| Appareils liés                 | applications de bureau et mobiles liées au compte         |
| Dernière bibliothèque modifiée | nom de la dernière bibliothèque modifiée                  |
| Dernière modification          | son jour et son heure                                     |

**Le serveur** (`Serveur Seafile`, comptes administrateurs seulement) :

- Utilisateurs
- Utilisateurs actifs
- Bibliothèques
- Fichiers
- Groupes
- Appareils liés
- Appareils connectés
- Stockage utilisé

Le stockage utilisé est en Mo, pour toutes les bibliothèques du serveur.

L'intégration lit Seafile avec son propre minuteur, et ne publie que ce qui
change (plus une valeur inchangée toutes les 12 heures, pour que Gladys
n'affiche jamais « pas de valeur récente »).

## Tableau de bord

Le widget **Stockage Seafile** montre le quota utilisé en jauge (vert, orange
10 points avant le seuil, rouge au-delà), l'espace utilisé, le nombre de
bibliothèques, puis les six dernières bibliothèques modifiées avec leur taille
et leur heure. Le bouton **Actualiser** relit Seafile. Il fonctionne avant même
l'ajout du compte dans Gladys.

## Scènes

### Déclencheurs

- **Une bibliothèque est modifiée** : un fichier est ajouté, modifié, supprimé
  ou renommé dans une bibliothèque que voit le compte. Filtres : la
  bibliothèque (son nom exact) et qui l'a modifiée (le nom affiché par
  Seafile), vides pour toutes. Variables : bibliothèque, modifiée par,
  propriétaire, taille, taille en octets, et si la bibliothèque est partagée
  avec le compte. Un événement par bibliothèque à chaque lecture ; une
  bibliothèque créée n'est pas annoncée, sa modification suivante l'est.
- **Le quota dépasse le seuil** : le compte dépasse le seuil de la
  configuration. Une fois, jusqu'à ce que l'usage redescende 5 points en
  dessous. Variables : quota utilisé (%), seuil, espace utilisé, quota. Un quota déjà
  au-dessus du seuil à la première lecture, ou quand le seuil change, n'est pas
  annoncé.

Une modification faite pendant que l'intégration ou Gladys était arrêtée est
annoncée à la lecture suivante, une fois. Rien n'est annoncé à la toute première
lecture.

### Actions

- **État du compte** : lit le compte (à nouveau si la dernière lecture date de
  plus de 15 secondes) et donne l'espace utilisé, le quota, le quota utilisé
  (-1 sans quota), les bibliothèques, les appareils liés, la dernière
  bibliothèque modifiée avec son heure, et une phrase toute prête comme
  « Seafile : 4.2 GB utilisés sur 10.0 GB (42 %), 3 bibliothèques, dernière
  modification : Photos le 22/10 08:12. »

### Idées de scènes

- Quand la bibliothèque « Scans » est modifiée, vous envoyer un message
  « Nouveau scan dans Seafile ».
- Quand le quota dépasse le seuil, envoyer un message avec l'espace utilisé et
  le quota.
- Chaque dimanche soir, lancer « État du compte » et envoyer sa phrase.
- Quand « En ligne » du compte passe à 0, envoyer un message : Seafile est
  arrêté.

## Dépannage

- **« Seafile ne répond pas »** : vérifiez l'adresse depuis la machine de
  Gladys (l'interface web doit s'y ouvrir), et le pare-feu.
- **« identifiant, mot de passe ou jeton refusé par Seafile »** : vérifiez-les
  dans l'interface web ; un jeton d'API est supprimé quand le mot de passe
  change ou quand vous vous déconnectez de tous les appareils. Un mot de passe refusé n'est pas réessayé tout seul (Seafile pourrait bloquer le compte) : corrigez-le, puis enregistrez la configuration ou cliquez sur **Tester la connexion**.
- **« double authentification active : utilisez un jeton d'API »** : créez un
  jeton comme indiqué plus haut.
- **« aucune API Seafile à cette adresse »** : l'adresse n'est pas celle de
  l'interface web de Seafile (le port 8082 du serveur de fichiers ne suffit
  pas).
- **« l'adresse redirige »** : saisissez l'adresse en `https://`.
- **« certificat refusé »** : le conteneur ne fait confiance qu'aux certificats
  valides ; utilisez-en un, ou l'adresse en `http://` sur votre réseau.
- **« Seafile limite les requêtes »** : choisissez une fréquence plus lente.
- **Pas d'appareil serveur** : le compte n'est pas administrateur. Une
  promotion est vue dans l'heure.
- Les logs de l'intégration (Intégrations → Seafile) en disent plus, sans
  aucun mot de passe ni jeton.

## Limites

- Un compte par intégration. Les bibliothèques sont celles que voit le compte.
- « Une bibliothèque est modifiée » dit quelle bibliothèque et qui, pas quel
  fichier.
- Une bibliothèque modifiée plusieurs fois entre deux lectures donne un seul
  événement ; 20 bibliothèques au plus sont annoncées par lecture.
- Les tailles sont en unités décimales (1 Mo = 1 000 000 octets), comme les
  affiche Seafile.
- Le mot de passe reste dans la configuration de Gladys ; seul le jeton que
  Seafile donne en échange est gardé, en mémoire. Rien de secret n'est écrit
  dans `/data`.
- Développée et testée avec un vrai Seafile en Docker, pas encore sur toutes
  les installations : vos retours sont les bienvenus. Sans lien avec Seafile
  Ltd.
