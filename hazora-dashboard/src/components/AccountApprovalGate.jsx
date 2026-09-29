import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../config/roles';
import ApprovalStatusPage from './ApprovalStatusPage';

export default function AccountApprovalGate({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (profile) => {
        if (!profile.exists()) {
          setStatus('unavailable');
          return;
        }

        const profileData = profile.data();
        if (profileData.approvalStatus === 'rejected') {
          setStatus('rejected');
        } else if (profileData.approvalStatus === 'pending' || !ROLES.includes(profileData.role)) {
          setStatus('pending');
        } else {
          setStatus(profileData.approvalStatus || 'approved');
        }
      },
      () => setStatus('unavailable'),
    );

    return unsubscribe;
  }, [user.uid]);

  async function handleSignOut() {
    await signOut(auth);
    navigate('/login');
  }

  if (status === 'loading') {
    return <div className="loading-screen">Checking account approval...</div>;
  }

  if (status !== 'approved') {
    return (
      <ApprovalStatusPage
        status={status}
        email={user.email}
        onSignOut={handleSignOut}
      />
    );
  }

  return children;
}