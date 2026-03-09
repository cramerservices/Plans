import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function ensureProfile(user: User) {
  const email = normalizeEmail(user.email || '');

  if (!email) return;

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email,
        role: user.app_metadata?.role === 'admin' ? 'admin' : 'customer',
      },
      { onConflict: 'id' }
    );

  if (error) {
    console.error('ensureProfile upsert failed:', error);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error('getSession error:', error);
        }

        if (!mounted) return;

        const currentSession = data.session ?? null;
        const currentUser = currentSession?.user ?? null;

        setSession(currentSession);
        setUser(currentUser);
        setIsAdmin(currentUser?.app_metadata?.role === 'admin');

        if (currentUser) {
          await ensureProfile(currentUser);
        }
      } catch (err) {
        console.error('loadSession failed:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        const currentSession = session ?? null;
        const currentUser = currentSession?.user ?? null;

        setSession(currentSession);
        setUser(currentUser);
        setIsAdmin(currentUser?.app_metadata?.role === 'admin');

        if (currentUser) {
          await ensureProfile(currentUser);
        }
      } catch (err) {
        console.error('onAuthStateChange failed:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const cleanEmail = normalizeEmail(email);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) throw error;

    if (data.user) {
      await ensureProfile(data.user);
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const cleanEmail = normalizeEmail(email);

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) throw error;

    if (data.user) {
      await ensureProfile(data.user);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isAdmin,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
