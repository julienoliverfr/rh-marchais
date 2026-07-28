import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { ToastProvider } from './components/Toast'
import AppErrorBridge from './components/AppErrorBridge'
import { ConfirmProvider } from './components/ConfirmDialog'
import Login from './pages/Login'
import Aide from './pages/Aide'
import Dashboard from './pages/employe/Dashboard'
import Saisie from './pages/employe/Saisie'
import Historique from './pages/employe/Historique'
import MesConges from './pages/employe/MesConges'
import SaisiePourCollegue from './pages/employe/SaisiePourCollegue'
import SaisiePourAutrui from './pages/responsable/SaisiePourAutrui'
import Validations from './pages/responsable/Validations'
import Conges from './pages/responsable/Conges'
import PolitiqueConges from './pages/responsable/PolitiqueConges'
import Exports from './pages/responsable/Exports'
import Familles from './pages/responsable/Familles'
import Collaborateurs from './pages/responsable/Collaborateurs'
import AdminHub from './pages/responsable/admin/AdminHub'
import ModelesContrat from './pages/responsable/admin/ModelesContrat'
import ReglesGenerales from './pages/responsable/admin/ReglesGenerales'
import TypesAbsence from './pages/responsable/admin/TypesAbsence'
import JoursFeries from './pages/responsable/admin/JoursFeries'
import Parametrage from './pages/responsable/admin/Parametrage'
import Utilisateurs from './pages/responsable/admin/Utilisateurs'
import ImportCollaborateurs from './pages/responsable/admin/ImportCollaborateurs'

export default function App() {
  return (
    <ToastProvider>
      <AppErrorBridge />
      <ConfirmProvider>
        <BrowserRouter>
          <Routes>
        <Route path="/login" element={<Login />} />
        {/* Aide (FAQ) accessible à tous, connecté ou non. */}
        <Route path="/aide" element={<Aide />} />

        {/* Espace employé */}
        <Route
          element={
            <ProtectedRoute roles={['employe', 'responsable']}>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route
            path="/"
            element={
              <ProtectedRoute roles={['employe']}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/saisie"
            element={
              /* Ouvert au responsable : rattaché à un collaborateur, il est
                 aussi salarié et saisit ses propres heures/congés. Les écrans
                 gèrent proprement le cas « aucun collaborateur rattaché ». */
              <ProtectedRoute roles={['employe', 'responsable']}>
                <Saisie />
              </ProtectedRoute>
            }
          />
          <Route
            path="/historique"
            element={
              <ProtectedRoute roles={['employe', 'responsable']}>
                <Historique />
              </ProtectedRoute>
            }
          />
          <Route
            path="/conges"
            element={
              <ProtectedRoute roles={['employe', 'responsable']}>
                <MesConges />
              </ProtectedRoute>
            }
          />
          <Route
            path="/saisie-collegue"
            element={
              <ProtectedRoute roles={['employe']}>
                <SaisiePourCollegue />
              </ProtectedRoute>
            }
          />

          {/* Espace responsable / admin */}
          <Route
            path="/responsable"
            element={
              <ProtectedRoute roles={['responsable']}>
                <SaisiePourAutrui />
              </ProtectedRoute>
            }
          />
          <Route
            path="/responsable/validations"
            element={
              <ProtectedRoute roles={['responsable']}>
                <Validations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/responsable/conges"
            element={
              <ProtectedRoute roles={['responsable']}>
                <Conges />
              </ProtectedRoute>
            }
          />
          <Route
            path="/responsable/politique-conges"
            element={
              <ProtectedRoute roles={['responsable']}>
                <PolitiqueConges />
              </ProtectedRoute>
            }
          />
          <Route
            path="/responsable/exports"
            element={
              <ProtectedRoute roles={['responsable']}>
                <Exports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/responsable/familles"
            element={
              <ProtectedRoute roles={['responsable']}>
                <Familles />
              </ProtectedRoute>
            }
          />
          <Route
            path="/responsable/collaborateurs"
            element={
              <ProtectedRoute roles={['responsable']}>
                <Collaborateurs />
              </ProtectedRoute>
            }
          />

          {/* Hub Administration + zones de configuration */}
          <Route
            path="/responsable/admin"
            element={
              <ProtectedRoute roles={['responsable']}>
                <AdminHub />
              </ProtectedRoute>
            }
          />
          <Route
            path="/responsable/admin/modeles"
            element={
              <ProtectedRoute roles={['responsable']}>
                <ModelesContrat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/responsable/admin/regles"
            element={
              <ProtectedRoute roles={['responsable']}>
                <ReglesGenerales />
              </ProtectedRoute>
            }
          />
          <Route
            path="/responsable/admin/absences"
            element={
              <ProtectedRoute roles={['responsable']}>
                <TypesAbsence />
              </ProtectedRoute>
            }
          />
          <Route
            path="/responsable/admin/feries"
            element={
              <ProtectedRoute roles={['responsable']}>
                <JoursFeries />
              </ProtectedRoute>
            }
          />
          <Route
            path="/responsable/admin/parametrage"
            element={
              <ProtectedRoute roles={['responsable']}>
                <Parametrage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/responsable/admin/utilisateurs"
            element={
              <ProtectedRoute roles={['responsable']}>
                <Utilisateurs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/responsable/admin/import"
            element={
              <ProtectedRoute roles={['responsable']}>
                <ImportCollaborateurs />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ConfirmProvider>
    </ToastProvider>
  )
}
