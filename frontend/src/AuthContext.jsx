import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("API URL:", import.meta.env.VITE_API_URL);
    verify();
  }, []);

  async function verify() {
    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/auth/verify`,
        {},
        { withCredentials: true },
      );

      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }
  async function logout() {
    await axios.post(
      `${import.meta.env.VITE_API_URL}/auth/logout`,
      {},
      { withCredentials: true },
    );

    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, verify, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
