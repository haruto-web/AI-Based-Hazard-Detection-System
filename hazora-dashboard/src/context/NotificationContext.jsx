import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { collection, addDoc, updateDoc, doc, query, where, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

const MAX_NOTIFICATIONS = 50;

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [messageNotifications, setMessageNotifications] = useState([]);
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

  // Real-time listener for app-to-website messages addressed to this user.
  useEffect(() => {
    if (!user?.email) return;

    const email = user.email.trim().toLowerCase();
    const messagesRef = collection(db, 'messages');
    const byRecipientSearch = query(messagesRef, where('recipientSearch', '==', email), limit(MAX_NOTIFICATIONS));
    const byRecipient = query(messagesRef, where('recipient', '==', user.email), limit(MAX_NOTIFICATIONS));
    const latestById = new Map();

    function syncMessages(snapshot) {
      snapshot.docs.forEach((d) => {
            const data = d.data();
            latestById.set(d.id, {
              id: d.id,
              sourceType: 'message',
              read: data.unread === false || data.status === 'read',
              timestamp: data.createdAt || data.timestamp || data.time || null,
              violationType: data.subject || 'Message',
              cameraSource: data.body || data.message || data.preview || '',
              sender: data.sender || data.senderEmail || 'Mobile app',
              ...data,
            });
      });

      const messageList = Array.from(latestById.values()).sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || new Date(a.timestamp || 0).getTime();
        const bTime = b.createdAt?.toMillis?.() || new Date(b.timestamp || 0).getTime();
        return bTime - aTime;
      });

      setMessageNotifications(messageList);
    }

    const unsubscribeSearch = onSnapshot(
      byRecipientSearch,
      syncMessages,
      (err) => {
        console.warn('Messages notification listener error:', err.message);
      }
    );

    const unsubscribeRecipient = onSnapshot(
      byRecipient,
      syncMessages,
      (err) => {
        console.warn('Legacy messages notification listener error:', err.message);
      }
    );

    return () => {
      unsubscribeSearch();
      unsubscribeRecipient();
    };
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
    const messageNotif = messageNotifications.find((n) => n.id === id);

    if (messageNotif) {
      try {
        await updateDoc(doc(db, 'messages', id), {
          unread: false,
          status: 'read',
          readAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Failed to mark message as read:', err.message);
      }
      setMessageNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true, unread: false, status: 'read' } : n));
      return;
    }

    try {
      await updateDoc(doc(db, 'users', user.uid, 'notifications', id), { read: true });
    } catch (err) {
      console.warn('Failed to mark as read:', err.message);
      // Update locally anyway
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    }
  }, [user, messageNotifications]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    // Update all unread locally first for instant UI response
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setMessageNotifications(prev => prev.map(n => ({ ...n, read: true, unread: false, status: 'read' })));
    // Then persist each to Firestore
    const unread = notifications.filter(n => !n.read);
    for (const n of unread) {
      try {
        await updateDoc(doc(db, 'users', user.uid, 'notifications', n.id), { read: true });
      } catch (err) {
        // Best effort
      }
    }
    const unreadMessages = messageNotifications.filter(n => !n.read);
    for (const n of unreadMessages) {
      try {
        await updateDoc(doc(db, 'messages', n.id), {
          unread: false,
          status: 'read',
          readAt: serverTimestamp(),
        });
      } catch (err) {
        // Best effort
      }
    }
  }, [user, notifications, messageNotifications]);

  const allNotifications = [...messageNotifications, ...notifications]
    .sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || a.timestamp?.toMillis?.() || new Date(a.timestamp || 0).getTime();
      const bTime = b.createdAt?.toMillis?.() || b.timestamp?.toMillis?.() || new Date(b.timestamp || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, MAX_NOTIFICATIONS);

  const unreadCount = allNotifications.filter((n) => !n.read).length;

  const value = {
    notifications: allNotifications,
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
