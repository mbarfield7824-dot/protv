import { create } from 'zustand'
import { getVideos, getVideosByCategory, getCategories, getVideoById } from '../services/firestore'

export const useVideoStore = create((set) => ({
  videos: [],
  categories: [],
  loading: false,
  error: null,

  fetchVideos: async () => {
    set({ loading: true, error: null })
    try {
      const videos = await getVideos()
      set({ videos, loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
    }
  },

  fetchCategories: async () => {
    set({ loading: true, error: null })
    try {
      const categories = await getCategories()
      set({ categories, loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
    }
  },

  fetchVideosByCategory: async (category) => {
    set({ loading: true, error: null })
    try {
      const videos = await getVideosByCategory(category)
      set({ videos, loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
    }
  },

  fetchVideoById: async (id) => {
    set({ loading: true, error: null })
    try {
      const video = await getVideoById(id)
      set({ loading: false })
      return video
    } catch (error) {
      set({ error: error.message, loading: false })
      return null
    }
  },
}))
