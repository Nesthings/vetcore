import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AuthProvider } from '@/lib/auth'
import { Activate } from '@/pages/auth/Activate'
import { ForgotPassword } from '@/pages/auth/ForgotPassword'
import { Login } from '@/pages/auth/Login'
import { ResetPassword } from '@/pages/auth/ResetPassword'
import { DesignSystem } from '@/pages/DesignSystem'
import { SessionHome } from '@/pages/SessionHome'

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
                <SessionHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal"
            element={
              <ProtectedRoute>
                <SessionHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/super-admin"
            element={
              <ProtectedRoute>
                <SessionHome />
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
