import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { session, setUnauthorizedHandler } from '../api/client.js';
import { api } from '../api/endpoints.js';
import { can as canRole, ROLES } from './permissions.js';

const AuthContext = createContext(null);

const isKnownRole = (u) => Boolean(u && ROLES.includes(u.role));

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = session.getToken() ? session.getUser() : null;
    return isKnownRole(stored) ? stored : null;
  });
  const [sessionMessage, setSessionMessage] = useState('');

  const logout = useCallback((message = '') => {
    session.clear();
    setUser(null);
    setSessionMessage(message);
  }, []);

  // Any 401 on an authenticated request (expired/invalid token) ends the session.
  useEffect(() => {
    setUnauthorizedHandler((err) => logout(`Session ended: ${err.message}. Please log in again.`));
  }, [logout]);

  // On reload, confirm the stored session (and its role) with the backend.
  useEffect(() => {
    const token = session.getToken();
    if (!token) return;
    api
      .me()
      .then((res) => {
        if (!isKnownRole(res.data)) return logout('Unsupported account role. Please log in again.');
        session.save(token, res.data);
        setUser(res.data);
      })
      .catch(() => {
        // 401 is handled by the unauthorized handler; network errors keep the session.
      });
  }, [logout]);

  const login = useCallback(
    async (email, password) => {
      const res = await api.login(email, password);
      const loggedIn = res.data.user;
      if (!isKnownRole(loggedIn)) {
        logout('Unsupported account role.');
        throw new Error(`Unsupported role: ${loggedIn?.role}`);
      }
      session.save(res.data.token, loggedIn);
      setUser(loggedIn);
      setSessionMessage('');
      return loggedIn;
    },
    [logout],
  );

  const value = useMemo(
    () => ({
      user,
      role: user?.role ?? null,
      isAdmin: user?.role === 'ADMIN',
      can: (permission) => canRole(user?.role, permission),
      login,
      logout,
      sessionMessage,
    }),
    [user, login, logout, sessionMessage],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
