import { Link } from 'react-router-dom'

// Hub Administration : regroupe toutes les zones de configuration en cartes
// groupées (réservé au responsable-admin). Chaque carte = titre + description +
// lien vers la page correspondante. Les routes de configuration restent
// fonctionnelles : on y accède désormais par ce hub.

interface CarteAdmin {
  titre: string
  description: string
  to: string
}

interface GroupeAdmin {
  titre: string
  cartes: CarteAdmin[]
}

const GROUPES: GroupeAdmin[] = [
  {
    titre: 'Organisation',
    cartes: [
      {
        titre: 'Équipes',
        description:
          'Équipes Vignes / Marchais : mode de saisie et pause déduite.',
        to: '/responsable/familles',
      },
      {
        titre: 'Collaborateurs',
        description:
          'Fiches collaborateurs, équipe de rattachement et contrat.',
        to: '/responsable/collaborateurs',
      },
    ],
  },
  {
    titre: 'Contrats & congés',
    cartes: [
      {
        titre: 'Modèles de contrat',
        description:
          'Modèles CDI / CDD / saisonnier : base, seuil h. sup, congés.',
        to: '/responsable/admin/modeles',
      },
      {
        titre: 'Politique de congés',
        description:
          'Période de référence, acquisition, prorata et report des congés.',
        to: '/responsable/politique-conges',
      },
      {
        titre: "Types d'absence",
        description:
          'Libellés, décompte du solde CP et justificatif requis par type.',
        to: '/responsable/admin/absences',
      },
      {
        titre: 'Jours fériés',
        description:
          'Fériés nationaux automatiques + ponts chômés ou fériés travaillés.',
        to: '/responsable/admin/feries',
      },
    ],
  },
  {
    titre: 'Système',
    cartes: [
      {
        titre: 'Règles générales',
        description:
          'Fenêtre de saisie rétroactive, seuil h. sup par défaut, verrouillage.',
        to: '/responsable/admin/regles',
      },
      {
        titre: 'Utilisateurs',
        description:
          'Comptes de connexion : rôle, collaborateur rattaché, création / suppression.',
        to: '/responsable/admin/utilisateurs',
      },
      {
        titre: 'Import de données',
        description:
          'Import en masse de collaborateurs (CSV / Excel) : modèle, aperçu, validation, rapport.',
        to: '/responsable/admin/import',
      },
    ],
  },
]

export default function AdminHub() {
  return (
    <div>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Administration
      </h2>
      <p className="muted">
        Réglages et configuration de l'application. Sélectionnez une zone.
      </p>

      {GROUPES.map((groupe) => (
        <section key={groupe.titre}>
          <h3 className="section-title">{groupe.titre}</h3>
          <div className="grid admin-grid">
            {groupe.cartes.map((carte) => (
              <Link key={carte.to} to={carte.to} className="card admin-card">
                <span className="admin-card-title">{carte.titre}</span>
                <span className="admin-card-desc muted">{carte.description}</span>
                <span className="admin-card-cta">Ouvrir →</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
