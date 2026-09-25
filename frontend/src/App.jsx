import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Player from './pages/Player';
import Admin from './pages/Admin';
import Profile from './pages/Profile';
import About from './pages/About';
import Contact from './pages/Contact';
import Faq from './pages/Faq';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import AcceptableUsePolicy from './pages/AcceptableUsePolicy';
import WatchHistory from './pages/WatchHistory';
import Shows from './pages/Shows';
import ShowDetail from './pages/ShowDetail';
import Creators from './pages/Creators';
import CollectionPage from './pages/CollectionPage';
import { AuthProvider } from './context/AuthContext';
import { Analytics } from '@vercel/analytics/react';
import './App.css';

function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);

  return null;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/player/:id" element={<Player />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/acceptable-use-policy" element={<AcceptableUsePolicy />} />
          <Route path="/history" element={<WatchHistory />} />
          <Route path="/shows" element={<Shows />} />
          <Route path="/shows/:slug" element={<ShowDetail />} />
          <Route path="/creators" element={<Creators />} />
          <Route path="/music" element={<CollectionPage category="Music" />} />
          <Route path="/cartoons" element={<CollectionPage category="Cartoons" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Analytics />
    </AuthProvider>
  );
}

export default App;
