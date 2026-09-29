import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthForm from '../components/AuthForm';

export default function Login() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loginStarted, setLoginStarted] = useState(false);

  if (user && !loginStarted) return <Navigate to="/" replace />;

  return (
    <AuthForm
      mode="login"
      onLoginStarted={() => setLoginStarted(true)}
      onSuccess={async (signedInUser) => {
        const token = await signedInUser.getIdTokenResult();
        navigate(token.claims.admin ? '/admin' : '/');
      }}
    />
  );
}
