import { useState } from 'react';
import { discoverMoods } from '../data/mockData';
import '../styles/DiscoverPanel.css';

export default function DiscoverPanel({ onMoodSelect }) {
  const [activeMood, setActiveMood] = useState(null);

  const handleSelect = (mood) => {
    const next = activeMood === mood.id ? null : mood.id;
    setActiveMood(next);
    if (onMoodSelect) onMoodSelect(next ? mood : null);
  };

  return (
    <div className="discover-panel">
      <div className="discover-glow-orb" />
      <div className="discover-header">
        <h2 className="discover-title">
          <span className="discover-icon-mark">◈</span> PROtv DISCOVER
        </h2>
        <p className="discover-subtitle">Find your next favorite.</p>
      </div>

      <div className="mood-grid">
        {discoverMoods.map((mood) => (
          <button
            key={mood.id}
            className={`mood-chip ${activeMood === mood.id ? 'active' : ''}`}
            onClick={() => handleSelect(mood)}
          >
            <span className="mood-emoji">{mood.icon}</span>
            <span className="mood-label">{mood.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
