import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';

import HomePage from './pages/HomePage';
import PlansPage from './pages/PlansPage';
import CheckoutPage from './pages/CheckoutPage';
import InvoiceCheckoutPage from './pages/InvoiceCheckoutPage';
import LoginPage from './pages/LoginPage';
import CustomerDashboard from './pages/CustomerDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';
import ProtectedRoute from './components/ProtectedRoute';
import SuccessPage from './pages/SuccessPage';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/success" element={<SuccessPage />} />

        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/checkout/:planId" element={<CheckoutPage />} />

        <Route
          path="/invoice-checkout"
          element={
            <ProtectedRoute>
              <InvoiceCheckoutPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <CustomerDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/*"
          element={
            <ProtectedRoute adminOnly>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
