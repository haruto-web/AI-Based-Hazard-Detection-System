import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const SiteContext = createContext(null);

export function SiteProvider({ children }) {
  const [sites, setSites] = useState([]);
  const [activeSite, setActiveSite] = useState('');
  const [loading, setLoading] = useState(true);

  // Real-time listener for sites collection
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'sites'),
      (snapshot) => {
        const siteList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        siteList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setSites(siteList);

        // Set default active site if none selected
        if (siteList.length > 0) {
          setActiveSite(prev => {
            if (!prev || !siteList.some(s => s.name === prev)) {
              return siteList[0].name;
            }
            return prev;
          });
        }
        setLoading(false);
      },
      (err) => {
        console.warn('Sites listener error:', err.message);
        setSites([{ id: 'default', name: 'Main Site' }]);
        setActiveSite(prev => prev || 'Main Site');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const addSite = useCallback(async (siteName, createdBy) => {
    if (!siteName.trim()) return;
    if (sites.some(s => s.name.toLowerCase() === siteName.trim().toLowerCase())) {
      throw new Error('Site already exists');
    }
    try {
      const docRef = await addDoc(collection(db, 'sites'), {
        name: siteName.trim(),
        createdAt: serverTimestamp(),
        createdBy: createdBy || {},
      });
      return { id: docRef.id, name: siteName.trim() };
    } catch (err) {
      throw new Error('Failed to add site: ' + err.message);
    }
  }, [sites]);

  const removeSite = useCallback(async (siteId) => {
    try {
      await deleteDoc(doc(db, 'sites', siteId));
    } catch (err) {
      throw new Error('Failed to remove site: ' + err.message);
    }
  }, []);

  const value = {
    sites,
    activeSite,
    setActiveSite,
    addSite,
    removeSite,
    loading,
  };

  return (
    <SiteContext.Provider value={value}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSites() {
  const context = useContext(SiteContext);
  if (!context) {
    throw new Error('useSites must be used within a SiteProvider');
  }
  return context;
}
