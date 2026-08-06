import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AuthProvider } from '@/lib/auth'
import { Activate } from '@/pages/auth/Activate'
import { ForgotPassword } from '@/pages/auth/ForgotPassword'
import { Login } from '@/pages/auth/Login'
import { ResetPassword } from '@/pages/auth/ResetPassword'
import { Agenda } from '@/pages/Agenda'
import { Dashboard } from '@/pages/Dashboard'
import { DesignSystem } from '@/pages/DesignSystem'
import { Inventory } from '@/pages/Inventory'
import { Invoices } from '@/pages/Invoices'
import { NewConsultation } from '@/pages/NewConsultation'
import { OwnerPetDetail } from '@/pages/owner/OwnerPetDetail'
import { OwnerPortal } from '@/pages/owner/OwnerPortal'
import { PetDetail } from '@/pages/PetDetail'
import { Pets } from '@/pages/Pets'
import { Profile } from '@/pages/Profile'
import { Services } from '@/pages/Services'
import { Settings } from '@/pages/Settings'
import { SuperAdminPanel } from '@/pages/superadmin/SuperAdminPanel'
import { Templates } from '@/pages/Templates'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/activate" element={<Activate />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/design-system" element={<DesignSystem />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/agenda"
            element={
              <ProtectedRoute>
                <Agenda />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pets"
            element={
              <ProtectedRoute>
                <Pets />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pets/:id"
            element={
              <ProtectedRoute>
                <PetDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pets/:id/consultas/nueva"
            element={
              <ProtectedRoute>
                <NewConsultation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <ProtectedRoute>
                <Inventory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/templates"
            element={
              <ProtectedRoute roles={['admin', 'veterinario']}>
                <Templates />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/services"
            element={
              <ProtectedRoute roles={['admin']}>
                <Services />
              </ProtectedRoute>
            }
          />
          <Route
            path="/invoices"
            element={
              <ProtectedRoute roles={['admin']}>
                <Invoices />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute roles={['admin']}>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal"
            element={
              <ProtectedRoute roles={['owner']}>
                <OwnerPortal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/pets/:id"
            element={
              <ProtectedRoute roles={['owner']}>
                <OwnerPetDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/super-admin"
            element={
              <ProtectedRoute roles={['super-admin']}>
                <SuperAdminPanel />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
