import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthForm from '../components/AuthForm';

export default function Register() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [registrationStarted, setRegistrationStarted] = useState(false);

  if (user && !registrationStarted) return <Navigate to="/" replace />;

  return (
    <AuthForm
      mode="register"
      onRegisterStarted={() => setRegistrationStarted(true)}
      onSuccess={() => navigate('/')}
    />
  );
}
