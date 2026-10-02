import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Movies from './pages/Movies';
import Documentaries from './pages/Documentaries';
import Search from './pages/Search';
import MyList from './pages/MyList';
import Title from './pages/Title';
import Player from './pages/Player';
import Admin from './pages/Admin';
import Profile from './pages/Profile';
import About from './pages/About';
import Contact from './pages/Contact';
import Faq from './pages/Faq';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import AcceptableUsePolicy from './pages/AcceptableUsePolicy';
import DmcaPolicy from './pages/DmcaPolicy';
import WatchHistory from './pages/WatchHistory';
import Series from './pages/Series';
import SeriesDetail from './pages/SeriesDetail';
import Creators from './pages/Creators';
import CollectionPage from './pages/CollectionPage';
import Music from './pages/Music';
import Activate from './pages/Activate';
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
          <Route path="/movies" element={<Movies />} />
          <Route path="/documentaries" element={<Documentaries />} />
          <Route path="/search" element={<Search />} />
          <Route path="/my-list" element={<MyList />} />
          <Route path="/title/:id" element={<Title />} />
          <Route path="/player/:id" element={<Player />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/acceptable-use-policy" element={<AcceptableUsePolicy />} />
          <Route path="/dmca-policy" element={<DmcaPolicy />} />
          <Route path="/history" element={<WatchHistory />} />
          <Route path="/series" element={<Series />} />
          <Route path="/series/:seriesKey" element={<SeriesDetail />} />
          <Route path="/shows" element={<Navigate to="/series" replace />} />
          <Route path="/shows/:slug" element={<Navigate to="/series" replace />} />
          <Route path="/creators" element={<Creators />} />
          <Route path="/activate" element={<Activate />} />
          <Route path="/music" element={<Music />} />
          <Route path="/cartoons" element={<CollectionPage category="Cartoons" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Analytics />
    </AuthProvider>
  );
}

export default App;
