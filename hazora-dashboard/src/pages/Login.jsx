import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthForm from '../components/AuthForm';

export default function Login() {
  const navigate = useNavigate();
  const { user } = useAuth();

  if (user) return <Navigate to="/" replace />;

  return <AuthForm mode="login" onSuccess={() => navigate('/')} />;
}
