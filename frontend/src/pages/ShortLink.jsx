import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import ProTVShell from '../components/ProTVShell';
import ProTVHeader from '../components/ProTVHeader';
import ProTVFooter from '../components/ProTVFooter';

export default function ShortLink() {
  const { slug } = useParams();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.resolveShortLink(slug).then(result => {
      if (active) window.location.replace(result.destination);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [slug]);
  return <ProTVShell><ProTVHeader /><main className="movies-page">
    <h1>{error ? 'This PROtv link is unavailable.' : 'Opening PROtv...'}</h1>
    {error && <p role="alert">{error}</p>}<Link to="/">Explore PROtv</Link>
  </main><ProTVFooter /></ProTVShell>;
}
