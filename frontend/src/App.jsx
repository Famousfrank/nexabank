import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import BankingApp from './pages/BankingApp';
import AuthScreen from './pages/AuthScreen';
import AdminLogin from './pages/AdminLogin';
import AdminDashboardSimple from './pages/AdminDashboardSimple';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<AuthScreen />} />
      <Route path="/admin" element={<AdminLogin />} />
      <Route path="/admin/dashboard" element={<AdminDashboardSimple />} />
      <Route path="/*" element={
        <PrivateRoute>
          <BankingApp />
        </PrivateRoute>
      } />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;