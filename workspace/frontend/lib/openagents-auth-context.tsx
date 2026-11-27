'use client';

import React, { createContext, useContext } from 'react';

/** The app always opens as this person. There is no login screen. */
export const LOCAL_USER = {
  email: 'local@localhost',
  displayName: 'Local',
  photoURL: null as string | null,
};

interface OpenAgentsAuthContextValue {
  user: typeof LOCAL_USER;
  idToken: string;
  loading: boolean;
  isOpenAgentsDomain: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  adoptWorkspaceSession: (_session: unknown) => void;
}

const OpenAgentsAuthContext = createContext<OpenAgentsAuthContextValue | null>(null);

export function useOpenAgentsAuth() {
  const ctx = useContext(OpenAgentsAuthContext);
  if (!ctx) throw new Error('useOpenAgentsAuth must be used within OpenAgentsAuthProvider');
  return ctx;
}

export function OpenAgentsAuthProvider({ children }: { children: React.ReactNode }) {
  const value: OpenAgentsAuthContextValue = {
    user: LOCAL_USER,
    // Empty on purpose. Any Authorization header is treated as a person, and a
    // placeholder would make the server ignore the project token and refuse
    // settings, including adding a member.
    idToken: '',
    loading: false,
    isOpenAgentsDomain: false,
    signIn: async () => {},
    signOut: async () => {},
    adoptWorkspaceSession: () => {},
  };
  return (
    <OpenAgentsAuthContext.Provider value={value}>
      {children}
    </OpenAgentsAuthContext.Provider>
  );
}
