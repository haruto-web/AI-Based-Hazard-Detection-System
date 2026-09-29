import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ThemeProvider } from './context/ThemeContext';
import { SiteProvider } from './context/SiteContext';
import ProtectedRoute from './components/ProtectedRoute';
import AccountApprovalGate from './components/AccountApprovalGate';
import { useAuth } from './context/AuthContext';
import './styles/App.css';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Welcome = lazy(() => import('./pages/Welcome'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

function HomeRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  return user ? (
    <ProtectedRoute>
      <AccountApprovalGate key={user.uid}>
        <Dashboard />
      </AccountApprovalGate>
    </ProtectedRoute>
  ) : <Welcome />;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <SiteProvider>
            <BrowserRouter>
              <Suspense fallback={<div>Loading app...</div>}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
                  <Route path="/" element={<HomeRoute />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </SiteProvider>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
