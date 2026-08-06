import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AuthProvider } from '@/lib/auth'
import { Activate } from '@/pages/auth/Activate'
import { ForgotPassword } from '@/pages/auth/ForgotPassword'
import { Login } from '@/pages/auth/Login'
import { ResetPassword } from '@/pages/auth/ResetPassword'
import { Agenda } from '@/pages/Agenda'
import { Audit } from '@/pages/Audit'
import { Automation } from '@/pages/Automation'
import { Dashboard } from '@/pages/Dashboard'
import { DesignSystem } from '@/pages/DesignSystem'
import { FinancialDashboard } from '@/pages/FinancialDashboard'
import { Inventory } from '@/pages/Inventory'
import { Invoices } from '@/pages/Invoices'
import { Kits } from '@/pages/Kits'
import { NewConsultation } from '@/pages/NewConsultation'
import { OwnerPetDetail } from '@/pages/owner/OwnerPetDetail'
import { OwnerInvoices } from '@/pages/owner/OwnerInvoices'
import { OwnerPortal } from '@/pages/owner/OwnerPortal'
import { PetDetail } from '@/pages/PetDetail'
import { Pets } from '@/pages/Pets'
import { Profile } from '@/pages/Profile'
import { PurchaseOrders } from '@/pages/PurchaseOrders'
import { Reports } from '@/pages/Reports'
import { Services } from '@/pages/Services'
import { Settings } from '@/pages/Settings'
import { SuperAdminPanel } from '@/pages/superadmin/SuperAdminPanel'
import { Templates } from '@/pages/Templates'
import { Waitlist } from '@/pages/Waitlist'

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
            path="/waitlist"
            element={
              <ProtectedRoute>
                <Waitlist />
              </ProtectedRoute>
            }
          />
          <Route
            path="/automation"
            element={
              <ProtectedRoute roles={['admin']}>
                <Automation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <ProtectedRoute>
                <Audit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/financial"
            element={
              <ProtectedRoute roles={['admin']}>
                <FinancialDashboard />
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
            path="/kits"
            element={
              <ProtectedRoute roles={['admin', 'veterinario']}>
                <Kits />
              </ProtectedRoute>
            }
          />
          <Route
            path="/purchase-orders"
            element={
              <ProtectedRoute roles={['admin']}>
                <PurchaseOrders />
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
            path="/portal/invoices"
            element={
              <ProtectedRoute roles={['owner']}>
                <OwnerInvoices />
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
