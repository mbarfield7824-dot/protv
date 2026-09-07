import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

export default function Navbar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <nav className="bg-secondary border-b border-gray-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="text-2xl font-bold text-accent">
            PROtv
          </Link>

          <div className="flex items-center gap-6">
            <Link to="/" className="hover:text-accent transition">
              Home
            </Link>
            {user ? (
              <>
                <Link to="/admin" className="hover:text-accent transition">
                  Admin
                </Link>
                <button
                  onClick={handleLogout}
                  className="bg-accent px-4 py-2 rounded hover:bg-orange-600 transition"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="hover:text-accent transition">
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="bg-accent px-4 py-2 rounded hover:bg-orange-600 transition"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
