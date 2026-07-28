# Guide de mise en ligne (test) — RH Marchais sur Hetzner

Ce guide met l'application en ligne pour un **test**, avec des **données fictives**, sur **un seul serveur Hetzner**. On fait ça **ensemble** : lance chaque étape, et si quelque chose bloque, envoie-moi le message affiché — je t'aide.

> ⏱️ Compte ~20–30 minutes. Tu n'as jamais besoin d'écrire de code : tu crées un serveur, tu colles **une commande**, tu attends.

---

## Étape 0 — Sécurité du compte
Sur ta console Hetzner, en haut, clique **« Enable 2FA now »** et active la double authentification. (2 min)

---

## Étape 1 — Créer un jeton d'accès au code (une seule fois)
Le serveur doit pouvoir lire ton dépôt privé. On lui donne un **jeton en lecture seule**.

1. Va sur **https://github.com/settings/personal-access-tokens/new** (Fine‑grained token).
2. **Token name** : `deploy-rh` · **Expiration** : 30 jours.
3. **Repository access** → *Only select repositories* → choisis **`rh-marchais`**.
4. **Permissions** → *Repository permissions* → **Contents : Read-only**.
5. Clique **Generate token** et **copie** le jeton (il commence par `github_pat_…`). Garde-le de côté.

> 🔒 Ce jeton ne donne accès qu'à **lire ce seul dépôt**. Rien d'autre.

*(Alternative plus simple si tu préfères : dis-moi, je peux rendre le dépôt public le temps du test — dans ce cas, pas besoin de jeton. Mais le code serait visible publiquement.)*

---

## Étape 2 — Créer le serveur
1. Dans Hetzner Cloud, ouvre ton projet (ou crée « rh-marchais ») → **Add Server** / **Create Server**.
2. **Location** : Falkenstein / Nuremberg (Allemagne) ou Helsinki → *Europe (RGPD)*.
3. **Image** : **Ubuntu 24.04**.
4. **Type** : **CX22** (2 vCPU, 4 Go) — suffisant pour le test.
5. **SSH keys** : si tu n'en as pas, ce n'est pas grave → laisse Hetzner créer un **mot de passe root** (il te l'enverra) ou utilise la console web (étape 3).
6. Laisse le reste par défaut, clique **Create & Buy now**.
7. Note l'**adresse IP** du serveur (affichée sur sa fiche).

---

## Étape 3 — Ouvrir la console du serveur
Pas besoin d'installer quoi que ce soit sur ton PC :
1. Clique sur ton serveur → onglet **Console** (icône `>_` en haut à droite).
2. Connecte-toi : `login: root` puis le **mot de passe** (celui reçu par mail, ou défini à la création).

Tu es maintenant « dans » le serveur.

---

## Étape 4 — Lancer l'installation (la seule commande à coller)
Copie-colle cette commande **en remplaçant `LE_JETON`** par le jeton de l'étape 1 :

```bash
export GH_TOKEN=LE_JETON; curl -fsSL -H "Authorization: token $GH_TOKEN" https://raw.githubusercontent.com/julienoliverfr/rh-marchais/main/deploy/install.sh -o install.sh && bash install.sh
```

Puis **Entrée**. L'installation se déroule toute seule (base, sécurité, appli). Ça prend **5–10 minutes**. À la fin, un encadré **✅ INSTALLATION TERMINÉE** affiche l'adresse et les comptes.

---

## Étape 5 — Tester 🎉
Ouvre dans ton navigateur : **`http://ADRESSE-IP-DU-SERVEUR`**

Comptes de démonstration (mot de passe **`demo1234`**) :
| Identifiant | Rôle |
|---|---|
| `jean` | Employé (Vignes) |
| `amelie` | Employé (Marchais) |
| `sophie` | Responsable / admin |

Fais le test à plusieurs : `jean` saisit des heures depuis son téléphone, `sophie` les valide depuis un PC → les deux voient bien **les mêmes données**. C'est ça, le « cerveau partagé ».

---

## Si ça bloque
- Copie-moi le **dernier message affiché** dans la console : je te dis quoi faire.
- Si la page ne s'ouvre pas : vérifie qu'aucun **pare-feu Hetzner** ne bloque les ports **80** et **8000** (Cloud Firewall → autoriser, ou n'en attache pas pour le test).

## Bon à savoir (test)
- Données **fictives** : aucun enjeu si quelqu'un tombe dessus.
- Accès en **http** (pas https) pour le test — on ajoutera un **nom de domaine + https** avant la vraie mise en production.
- **Sauvegardes** : à activer avant d'y mettre de vraies données (on en reparlera).
