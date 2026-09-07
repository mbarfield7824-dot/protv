import { create } from 'zustand'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth } from '../services/firebase'

export const useAuthStore = create((set) => {
  onAuthStateChanged(auth, (user) => {
    set({ user, loading: false })
  })

  return {
    user: null,
    loading: true,
    error: null,

    signup: async (email, password) => {
      set({ loading: true, error: null })
      try {
        await createUserWithEmailAndPassword(auth, email, password)
        set({ loading: false })
      } catch (error) {
        set({ error: error.message, loading: false })
        throw error
      }
    },

    login: async (email, password) => {
      set({ loading: true, error: null })
      try {
        await signInWithEmailAndPassword(auth, email, password)
        set({ loading: false })
      } catch (error) {
        set({ error: error.message, loading: false })
        throw error
      }
    },

    logout: async () => {
      set({ loading: true })
      try {
        await signOut(auth)
        set({ user: null, loading: false })
      } catch (error) {
        set({ error: error.message, loading: false })
        throw error
      }
    },
  }
})
