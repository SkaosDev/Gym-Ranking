import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ApiError, api } from '../lib/api.js';

const AuthContext = createContext(null);

/**
 * Holds the signed-in user. The session itself lives in an HttpOnly cookie the
 * JavaScript cannot read, so on load we simply ask the API who we are.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/auth/me')
      .then((profile) => {
        if (!cancelled) setUser(profile);
      })
      .catch((error) => {
        // 401 simply means nobody is signed in; anything else is worth seeing.
        if (!(error instanceof ApiError && error.isUnauthenticated)) console.error(error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const profile = await api.post('/auth/login', credentials);
    setUser(profile);
    return profile;
  }, []);

  const signup = useCallback(async (details) => {
    const profile = await api.post('/auth/signup', details);
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      // Even if the call fails, this browser is done with the session.
      setUser(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    const profile = await api.get('/auth/me');
    setUser(profile);
    return profile;
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, signup, logout, refresh }),
    [user, loading, login, signup, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
