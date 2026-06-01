import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthForm from '../components/AuthForm';

export default function Register() {
  const navigate = useNavigate();
  const { user } = useAuth();

  if (user) return <Navigate to="/" replace />;

  return <AuthForm mode="register" onSuccess={() => navigate('/')} />;
}
