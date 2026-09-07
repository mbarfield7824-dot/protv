import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore'
import { db } from './firebase'

export const getVideos = async () => {
  const videosRef = collection(db, 'videos')
  const snapshot = await getDocs(videosRef)
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

export const getVideoById = async (id) => {
  const videoRef = doc(db, 'videos', id)
  const snapshot = await getDoc(videoRef)
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export const getVideosByCategory = async (category) => {
  const videosRef = collection(db, 'videos')
  const q = query(videosRef, where('category', '==', category))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

export const getCategories = async () => {
  const videos = await getVideos()
  const categories = [...new Set(videos.map(v => v.category))]
  return categories.sort()
}
