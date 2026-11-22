import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { serverNow } from '../data/linearChannel';
import { testClockLabel, testPrograms, testTargets } from '../data/linearTestMode';

// Administrator-only controls for PROtv LIVE test mode. Every button only changes the simulated moment for this
// browser tab; the approved schedule and the real broadcast are never touched.
export default function LiveTestPanel({ clock, actualServerTime, onJump }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const from = new Date(Date.now() - 3_600_000).toISOString();
    const to = new Date(Date.now() + 14 * 86_400_000).toISOString();
    api.adminLinear(`schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((response) => { if (!cancelled) setItems(response.items || []); })
      .catch((failure) => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const programs = useMemo(() => testPrograms(items), [items]);
  const simulatedNow = clock ? serverNow(clock, tick) : null;
  const targets = simulatedNow === null ? {} : testTargets(items, simulatedNow, selectedId || null);
  const jump = (ms) => { if (ms !== null && ms !== undefined) onJump(ms); };

  const buttons = [
    ['Play selected program', targets.programStart, 'Starts the selected program from its first second.'],
    ['Selected: last 10 seconds', targets.programEnding, 'Tests the automatic handoff out of the selected program.'],
    ['Next commercial break', targets.nextBreak, 'Commercial, bumper and PROtv card, then the next program.'],
    ['5 s before next break', targets.beforeNextBreak, 'Watch the program hand over into the break.'],
    ['5 s before next transition', targets.handoff, 'Whatever is on air hands over to the next item.'],
    ['Premiere countdown', targets.countdownStart, 'From the start of the next premiere countdown.'],
    ['Countdown: last 20 s', targets.countdownFinal, 'The final clock and the handover into the episode.'],
  ];

  return (
    <section className="live-test" aria-label="PROtv LIVE test mode">
      <div className="live-test__clock">
        <strong>TEST MODE</strong>
        <span>Simulated: {simulatedNow ? testClockLabel(simulatedNow) : '…'}</span>
        {actualServerTime && <span>Only you see this. The real channel, schedule and viewers are unaffected.</span>}
      </div>
      {error && <p className="live-test__error" role="alert">{error}</p>}
      <label className="live-test__select">
        Scheduled program (approved, next 14 days)
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">Choose a program…</option>
          {programs.map((program) => <option key={program.id} value={program.id}>{program.label}</option>)}
        </select>
      </label>
      <div className="live-test__buttons">
        {buttons.map(([label, target, hint]) => (
          <button key={label} type="button" disabled={target === null || target === undefined} title={hint} onClick={() => jump(target)}>{label}</button>
        ))}
        <Link className="live-test__exit" to="/live?preview=1">Return to real LIVE</Link>
      </div>
    </section>
  );
}
