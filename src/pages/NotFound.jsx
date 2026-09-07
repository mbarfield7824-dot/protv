import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <p className="text-2xl mb-8">Page not found</p>
        <Link to="/" className="bg-accent px-6 py-3 rounded font-semibold hover:bg-orange-600 transition">
          Go Home
        </Link>
      </div>
    </div>
  )
}
