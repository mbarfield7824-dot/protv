import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

function ReportColumn({ title, items, emptyMessage, kind }) {
  return (
    <section className={`admin-bot-result admin-bot-result-${kind}`}>
      <h3>{title} <span>{items.length}</span></h3>
      {items.length === 0 ? (
        <p>{emptyMessage}</p>
      ) : (
        <ul>
          {items.map((item, index) => (
            <li key={`${item.title}-${index}`}>
              <strong>{item.title}</strong>
              <span>{item.message || item.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function DistributorIngestionPanel() {
  const [job, setJob] = useState(null);
  const [audit, setAudit] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [status, events] = await Promise.all([
        api.getDistributorIngestionStatus(),
        api.getDistributorIngestionAudit(),
      ]);
      setJob(status);
      setAudit(events);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (job?.status !== 'running') return undefined;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [job?.status, load]);

  const start = async () => {
    setError('');
    try {
      setJob(await api.startDistributorIngestion());
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const running = job?.status === 'running';
  const added = job?.addedMovies || [];
  const skipped = job?.skippedMovies || [];
  const failures = job?.failures || [];
  const warnings = job?.warnings || [];

  return (
    <section className="admin-bot-panel">
      <div className="admin-bot-heading">
        <div>
          <h2>Distributor Feed Automation</h2>
          <p>
            Validate licensed titles, prepare Mux playback, and publish only while the required
            territory and rights window are active.
          </p>
        </div>
        <button className="admin-submit" onClick={() => void start()} disabled={running}>
          {running ? 'Adapter Running' : 'Process Distributor Feed'}
        </button>
      </div>

      {error && <p className="admin-error">{error}</p>}

      <div className="admin-bot-status-card">
        <span className={`admin-bot-status-label admin-bot-status-${job?.status || 'idle'}`}>
          {(job?.status || 'idle').replaceAll('-', ' ')}
        </span>
        <strong>{job?.message || 'Ready to process the configured distributor feed.'}</strong>
        {job?.distributor && <p>Distributor: {job.distributor.name}</p>}
        {job?.currentItem && <p>Now processing: {job.currentItem}</p>}
      </div>

      <div className="admin-bot-results">
        <ReportColumn
          title="Added Movies"
          items={added}
          emptyMessage="No distributor titles have been added in this run."
          kind="success"
        />
        <ReportColumn
          title="Skipped Movies"
          items={skipped}
          emptyMessage="No distributor titles were skipped."
          kind="neutral"
        />
        <ReportColumn
          title="Needs Attention"
          items={failures}
          emptyMessage="No failures were reported."
          kind="error"
        />
      </div>

      {warnings.length > 0 && (
        <section className="admin-bot-warnings">
          <h3>Notes</h3>
          <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </section>
      )}

      <section className="admin-bot-audit">
        <div className="admin-bot-section-heading">
          <h3>Recent Distributor Activity</h3>
          <button className="admin-secondary" onClick={() => void load()}>Refresh</button>
        </div>
        {audit.length === 0 ? (
          <p>No distributor activity has been recorded.</p>
        ) : (
          <ul>
            {audit.map((event) => (
              <li key={event.id}>
                <span className={event.type === 'distributor.error' ? 'audit-error' : 'audit-success'} />
                <div>
                  <strong>{event.message}</strong>
                  <time>{new Date(event.createdAt).toLocaleString()}</time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="admin-bot-technical">
        <summary>Technical Output</summary>
        <pre>{JSON.stringify(job?.technicalOutput || [], null, 2)}</pre>
      </details>
    </section>
  );
}
