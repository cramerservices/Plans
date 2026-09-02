import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { normalizeEmail, syncProfileByEmail } from '../lib/profileSync';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, phone: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_EMAIL = 'cramerservicesllc@gmail.com';

async function checkAdminAccess(user: User | null): Promise<boolean> {
  if (!user?.email) return false;

  const cleanEmail = normalizeEmail(user.email);

  // Backup hard-coded admin check so you do not get locked out.
  if (cleanEmail === ADMIN_EMAIL) {
    return true;
  }

  // Also allow admin access from auth metadata if you ever set it later.
  if (user.app_metadata?.role === 'admin') {
    return true;
  }

  // Main admin check from public.profiles.role.
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (error) {
    console.error('Admin role check failed:', error);
    return false;
  }

  return data?.role === 'admin';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    const syncAuthState = async (currentSession: Session | null) => {
      const currentUser = currentSession?.user ?? null;

      setSession(currentSession);
      setUser(currentUser);

      if (currentUser?.id && currentUser.email) {
        await syncProfileByEmail({
          email: currentUser.email,
          authUserId: currentUser.id,
          phone: currentUser.user_metadata?.phone || null,
        });
      }

      const adminAccess = await checkAdminAccess(currentUser);

      if (!mounted) return;

      setIsAdmin(adminAccess);
      setLoading(false);
    };

    const loadSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error('getSession error:', error);
        }

        if (!mounted) return;

        await syncAuthState(data.session ?? null);
      } catch (err) {
        console.error('loadSession failed:', err);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      syncAuthState(nextSession ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const cleanEmail = normalizeEmail(email);

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string, phone: string) => {
    const cleanEmail = normalizeEmail(email);

    const { error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: fullName,
          phone,
        },
      },
    });

    if (error) {
      const canRecoverFromDbTriggerError = /database error saving new user/i.test(error.message || '');

      if (!canRecoverFromDbTriggerError) {
        throw error;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInError) {
        throw error;
      }
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
