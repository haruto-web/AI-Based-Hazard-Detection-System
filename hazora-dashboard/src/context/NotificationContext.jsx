import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { collection, addDoc, updateDoc, doc, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

const MAX_NOTIFICATIONS = 50;

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const { user } = useAuth();

  // Real-time listener for notifications (per-user)
  useEffect(() => {
    if (!user) return;

    const notifRef = collection(db, 'users', user.uid, 'notifications');
    const q = query(notifRef, orderBy('timestamp', 'desc'), limit(MAX_NOTIFICATIONS));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setNotifications(notifList);
      },
      (err) => {
        console.warn('Notifications listener error:', err.message);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const addNotification = useCallback(async (notification) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'notifications'), {
        read: false,
        timestamp: serverTimestamp(),
        ...notification,
      });
    } catch (err) {
      console.warn('Failed to save notification:', err.message);
      // Still show locally even if Firestore fails
      setNotifications(prev => [{
        id: Date.now().toString(),
        read: false,
        timestamp: new Date().toISOString(),
        ...notification,
      }, ...prev].slice(0, MAX_NOTIFICATIONS));
    }
  }, [user]);

  const markAsRead = useCallback(async (id) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'notifications', id), { read: true });
    } catch (err) {
      console.warn('Failed to mark as read:', err.message);
      // Update locally anyway
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    }
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    // Update all unread locally first for instant UI response
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    // Then persist each to Firestore
    const unread = notifications.filter(n => !n.read);
    for (const n of unread) {
      try {
        await updateDoc(doc(db, 'users', user.uid, 'notifications', n.id), { read: true });
      } catch (err) {
        // Best effort
      }
    }
  }, [user, notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const value = {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
