import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { getCurrentUserRole } from '@/lib/firestoreApi'

interface AuthContextValue {
  user: User | null
  role: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  isSuperAdmin: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)
      if (!nextUser) {
        setRole(null)
        setIsLoading(false)
        return
      }

      const userRole = await getCurrentUserRole(nextUser.uid)
      setRole(userRole)
      setIsLoading(false)
    })

    return () => unsub()
  }, [])

  const value = useMemo(
    () => ({
      user,
      role,
      isLoading,
      isSuperAdmin: role === 'superadmin',
      login: async (email: string, password: string) => {
        setIsLoading(true)
        await signInWithEmailAndPassword(auth, email, password)
      },
      logout: async () => {
        await signOut(auth)
      },
    }),
    [isLoading, role, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return ctx
}
