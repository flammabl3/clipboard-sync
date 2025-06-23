// context/AuthContext.tsx
"use client";

import { createContext, useContext, ReactNode, useState } from "react";

type AuthContextType = {
  isAuthenticated: boolean;
  user: { username: string } | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ username: string } | null>(() => {
    // Try to load user from localStorage on first render
    const stored =
      typeof window !== "undefined" ? localStorage.getItem("user") : null;
    return stored ? JSON.parse(stored) : null;
  });

  const login = async (username: string, password: string) => {
    // Mock validation - in real app, this would call your API
    if (
      (username === "demo" && password === "test") ||
      (username === "test" && password === "test")
    ) {
      const userObj = { username };
      setUser(userObj);
      localStorage.setItem("user", JSON.stringify(userObj)); // Save to localStorage
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("user"); // Remove from localStorage
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!user,
        user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
