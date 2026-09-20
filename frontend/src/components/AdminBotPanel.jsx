import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const CANDIDATE_FILTERS = [
  { id: 'all', label: 'All titles' },
  { id: 'ready', label: 'Ready to review' },
  { id: 'reference', label: 'Reference only' },
  { id: 'uploading', label: 'Uploading' },
  { id: 'retry', label: 'Retry required' },
  { id: 'attention', label: 'Needs attention' },
];

function candidateWorkflowStatus(item, startingIds) {
  if (startingIds.includes(item.id)) return 'uploading';
  if (item.decision === 'processing') return item.catalogId ? 'uploading' : 'retry';
  if (item.decision === 'failed') return 'attention';
  return item.ingestionAvailable ? 'ready' : 'reference';
}

function readableDescription(value) {
  const text = String(value || '').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!text || /Drupal\.settings|jQuery\.extend|mediafront_/i.test(text)) {
    return 'Open the source page to review this title’s description and media details.';
  }
  return text.length > 420 ? `${text.slice(0, 417).trimEnd()}...` : text;
}

function ResultList({ title, items, emptyMessage, kind, renderItem }) {
  return (
    <section className={`admin-bot-result admin-bot-result-${kind}`}>
      <h3>{title} <span>{items.length}</span></h3>
      {items.length === 0 ? (
        <p>{emptyMessage}</p>
      ) : (
        <ul>
          {items.map((item, index) => (
            <li key={`${item.title || item.fileName || title}-${index}`}>{renderItem(item)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdminBotPanel({ onPrepareManualUpload }) {
  const [job, setJob] = useState(null);
  const [audit, setAudit] = useState([]);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [contentKind, setContentKind] = useState('movie');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [confirmedId, setConfirmedId] = useState('');
  const [webJob, setWebJob] = useState(null);
  const [discoveryJob, setDiscoveryJob] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [candidateStatus, setCandidateStatus] = useState(null);
  const [startingIds, setStartingIds] = useState([]);
  const [candidateFilter, setCandidateFilter] = useState('all');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible'
  );

  const loadStatus = useCallback(async () => {
    try {
      setJob(await api.getAdminBotStatus());
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      setAudit(await api.getAdminBotAudit());
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  const load = useCallback(async () => {
    await Promise.all([loadStatus(), loadAudit()]);
  }, [loadAudit, loadStatus]);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    if (!pageVisible) return undefined;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, pageVisible]);

  useEffect(() => {
    if (!pageVisible || job?.status !== 'running') return undefined;
    const timer = setInterval(() => void loadStatus(), 10000);
    return () => clearInterval(timer);
  }, [job?.status, loadStatus, pageVisible]);

  const loadWebStatus = useCallback(async () => {
    try {
      setWebJob(await api.getPublicDomainWebStatus());
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  const loadDiscovery = useCallback(async () => {
    try {
      const queue = await api.getPublicDomainCandidates();
      setDiscoveryJob(queue.discovery);
      setCandidates(queue.items);
      setCandidateStatus(queue.status);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => {
    if (!pageVisible) return undefined;
    const timer = setTimeout(() => void loadWebStatus(), 0);
    return () => clearTimeout(timer);
  }, [loadWebStatus, pageVisible]);

  useEffect(() => {
    if (!pageVisible) return undefined;
    const timer = setTimeout(() => void loadDiscovery(), 0);
    return () => clearTimeout(timer);
  }, [loadDiscovery, pageVisible]);

  useEffect(() => {
    if (!pageVisible || !['running', 'processing'].includes(webJob?.status)) return undefined;
    const timer = setInterval(() => {
      void loadWebStatus();
    }, 10000);
    return () => clearInterval(timer);
  }, [webJob?.status, loadWebStatus, pageVisible]);

  useEffect(() => {
    if (!pageVisible || startingIds.length === 0) return undefined;
    const timer = setInterval(() => void loadDiscovery(), 10000);
    return () => clearInterval(timer);
  }, [startingIds.length, loadDiscovery, pageVisible]);

  useEffect(() => {
    if (!pageVisible || discoveryJob?.status !== 'running') return undefined;
    const timer = setInterval(() => void loadDiscovery(), 10000);
    return () => clearInterval(timer);
  }, [discoveryJob?.status, loadDiscovery, pageVisible]);

  const start = async (dryRun) => {
    setError('');
    try {
      setJob(await api.startAdminBot(dryRun));
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const searchWeb = async (event) => {
    event.preventDefault();
    setSearching(true);
    setError('');
    setConfirmedId('');
    try {
      const results = await api.searchPublicDomainWeb(searchQuery, contentKind);
      setSearchResults(results.items);
      await loadDiscovery();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSearching(false);
    }
  };

  const ingestWebItem = async (item) => {
    setError('');
    setStartingIds((current) => [...new Set([...current, item.id])]);
    try {
      setWebJob(await api.ingestPublicDomainWebItem(item.id));
      setConfirmedId('');
      await loadDiscovery();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setStartingIds((current) => current.filter((id) => id !== item.id));
    }
  };

  const runDiscovery = async () => {
    setError('');
    try {
      setDiscoveryJob(await api.startPublicDomainDiscovery());
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const rejectCandidate = async (item) => {
    setError('');
    try {
      await api.rejectPublicDomainCandidate(item.id);
      setCandidates((current) => current.filter((candidate) => candidate.id !== item.id));
      setConfirmedId('');
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const candidateCounts = useMemo(() => {
    const counts = Object.fromEntries(CANDIDATE_FILTERS.map((filter) => [filter.id, 0]));
    counts.all = candidates.length;
    candidates.forEach((candidate) => {
      counts[candidateWorkflowStatus(candidate, startingIds)] += 1;
    });
    return counts;
  }, [candidates, startingIds]);

  const candidateSources = useMemo(
    () => [...new Set(candidates.map((candidate) => candidate.sourceLabel).filter(Boolean))].sort(),
    [candidates]
  );

  const visibleCandidates = useMemo(() => {
    const query = candidateSearch.trim().toLowerCase();
    const statusOrder = { uploading: 0, retry: 1, attention: 2, ready: 3, reference: 4 };
    return candidates
      .filter((candidate) => (
        (candidateFilter === 'all' || candidateWorkflowStatus(candidate, startingIds) === candidateFilter)
        && (sourceFilter === 'all' || candidate.sourceLabel === sourceFilter)
        && (!query || [
          candidate.title,
          candidate.description,
          candidate.sourceLabel,
          ...(candidate.alternateSources || []),
        ].some((value) => String(value || '').toLowerCase().includes(query)))
      ))
      .sort((left, right) => (
        statusOrder[candidateWorkflowStatus(left, startingIds)] - statusOrder[candidateWorkflowStatus(right, startingIds)]
        || String(left.title || '').localeCompare(String(right.title || ''))
      ));
  }, [candidateFilter, candidateSearch, candidates, sourceFilter, startingIds]);

  const added = job?.addedMovies || [];
  const preview = job?.previewMovies || [];
  const skipped = job?.skippedMovies || [];
  const failures = job?.failures || [];
  const warnings = job?.warnings || [];
  const running = job?.status === 'running';

  return (
    <section className="admin-bot-panel">
      <section className="pd-web-search">
        <div className="admin-bot-heading">
          <div>
            <h2>Automatic Content Hunt</h2>
            <p>
              The bot searches trusted sources once a day. Nothing uploads until you review and
              confirm one title.
            </p>
          </div>
          <button
            className="admin-submit"
            disabled={discoveryJob?.status === 'running'}
            onClick={() => void runDiscovery()}
          >
            {discoveryJob?.status === 'running' ? 'Searching Sources...' : 'Run Discovery Now'}
          </button>
        </div>

        <div className="admin-bot-status-card">
          <strong>{discoveryJob?.message || 'Ready to search.'}</strong>
          <p>
            Last search: {candidateStatus?.lastDiscoveryAt
              ? new Date(candidateStatus.lastDiscoveryAt).toLocaleString()
              : 'Not run yet'}
            {' · '}{candidateStatus?.pending || 0} waiting for review
          </p>
          <p>
            Next automatic search: {discoveryJob?.schedule?.enabled
              ? (discoveryJob.schedule.nextRunAt
                ? new Date(discoveryJob.schedule.nextRunAt).toLocaleString()
                : 'After the first completed search')
              : 'Automatic search is disabled'}
          </p>
          {discoveryJob?.sourceResults?.map((source) => (
            <span key={source.source}>
              {source.source}: {source.status === 'failed' ? 'Unavailable' : `${source.found} found`}
              {' '}
            </span>
          ))}
        </div>

        {webJob && webJob.status !== 'idle' && (
          <div className="admin-bot-status-card">
            <span className={`admin-bot-status-label admin-bot-status-${webJob.status}`}>
              {webJob.status.replaceAll('-', ' ')}
            </span>
            <strong>{webJob.message}</strong>
            {['running', 'processing'].includes(webJob.status) && (
              <p>Mux is preparing the video. Large titles can take several minutes.</p>
            )}
            {webJob.currentItem && <p>Now processing: {webJob.currentItem}</p>}
            {webJob.items?.length > 0 && (
              <div className="pd-upload-progress-list">
                {webJob.items.map((item) => (
                  <div className={`pd-upload-progress pd-upload-progress-${item.status}`} key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.stage}</span>
                    </div>
                    <span>{item.progressPercent}%</span>
                    <div
                      className="pd-upload-progress-track"
                      role="progressbar"
                      aria-label={`${item.title} upload progress`}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-valuenow={item.progressPercent}
                    >
                      <div style={{ width: `${item.progressPercent}%` }} />
                    </div>
                    {item.error && <small>{item.error}</small>}
                  </div>
                ))}
              </div>
            )}
            {webJob.addedMovies?.map((item) => <p key={item.catalogId}>{item.message}</p>)}
            {!webJob.items?.length && webJob.failures?.map((item) => (
              <p className="admin-error" key={item.title}>{item.title}: {item.message}</p>
            ))}
          </div>
        )}

        {candidates.length > 0 && (
          <div className="pd-candidate-controls">
            <div className="pd-status-filters" aria-label="Filter titles by workflow status">
              {CANDIDATE_FILTERS.map((filter) => (
                <button
                  className={candidateFilter === filter.id ? 'active' : ''}
                  key={filter.id}
                  type="button"
                  aria-pressed={candidateFilter === filter.id}
                  onClick={() => setCandidateFilter(filter.id)}
                >
                  {filter.label}
                  <span>{candidateCounts[filter.id]}</span>
                </button>
              ))}
            </div>
            <div className="pd-candidate-search">
              <label>
                Search titles
                <input
                  type="search"
                  value={candidateSearch}
                  onChange={(event) => setCandidateSearch(event.target.value)}
                  placeholder="Title or source"
                />
              </label>
              <label>
                Source
                <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                  <option value="all">All sources</option>
                  {candidateSources.map((source) => <option key={source}>{source}</option>)}
                </select>
              </label>
            </div>
            <p className="pd-filter-summary">
              Showing {visibleCandidates.length} of {candidates.length} unique titles
            </p>
          </div>
        )}

        <div className="pd-web-results">
          {candidates.length === 0 && <p>No titles are waiting. Run discovery to refresh the queue.</p>}
          {candidates.length > 0 && visibleCandidates.length === 0 && (
            <div className="pd-filter-empty">
              <strong>No titles match these filters.</strong>
              <button
                type="button"
                onClick={() => {
                  setCandidateFilter('all');
                  setCandidateSearch('');
                  setSourceFilter('all');
                }}
              >
                Clear filters
              </button>
            </div>
          )}
          {visibleCandidates.map((item) => {
            const confirmed = confirmedId === item.id;
            const processing = item.decision === 'processing' && Boolean(item.catalogId);
            const stalled = item.decision === 'processing' && !item.catalogId;
            const starting = startingIds.includes(item.id);
            const progressPercent = starting ? Math.max(item.progressPercent || 0, 5) : item.progressPercent;
            const progressStage = starting
              ? item.stage || 'Starting upload'
              : item.stage;
            const failed = item.decision === 'failed';
            return (
              <article className="pd-web-card" key={item.id}>
                {item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt="" />
                ) : (
                  <div className="pd-poster-placeholder" aria-hidden="true">
                    <span>▶</span>
                    <strong>PROtv</strong>
                    <small>Public Domain</small>
                  </div>
                )}
                <div className="pd-web-card-body">
                  <div className="pd-web-card-heading">
                    <div>
                      <h3>{item.title}</h3>
                      <p>
                        {item.year || 'Year unavailable'} · {item.contentKind === 'show' ? 'Show' : 'Movie'}
                        {' · '}{item.sourceLabel}
                      </p>
                    </div>
                    <span className={item.ingestionAvailable && !failed ? 'pd-evidence-ready' : 'pd-evidence-missing'}>
                      {processing
                        ? 'Uploading'
                        : failed
                          ? 'Needs attention'
                          : stalled
                            ? 'Retry required'
                            : item.ingestionAvailable ? 'Ready for review' : 'Reference only'}
                    </span>
                  </div>
                  <p>{readableDescription(item.description)}</p>
                  <p><strong>Source evidence:</strong> {item.licenseEvidence?.label || item.ingestionReason}</p>
                  {item.alternateSources?.length > 0 && (
                    <p><strong>Also found on:</strong> {item.alternateSources.join(', ')}</p>
                  )}
                  {failed && <p className="admin-error">{item.lastError}</p>}
                  {(starting || processing || stalled || failed) && (
                    <div className="pd-card-progress">
                      <div>
                        <span>{progressStage || (failed ? 'Needs attention' : 'Preparing upload')}</span>
                        <strong>{progressPercent || 0}%</strong>
                      </div>
                      <div
                        className="pd-upload-progress-track"
                        role="progressbar"
                        aria-label={`${item.title} upload progress`}
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow={progressPercent || 0}
                      >
                        <div style={{ width: `${progressPercent || 0}%` }} />
                      </div>
                    </div>
                  )}
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer">Review source page</a>
                  {!processing && (
                    <label className="pd-confirmation">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        disabled={starting}
                        onChange={(event) => setConfirmedId(event.target.checked ? item.id : '')}
                      />
                      {item.ingestionAvailable
                        ? 'I reviewed the source evidence and confirm this title for ingestion.'
                        : 'I reviewed this reference and will provide authorized media and complete rights details.'}
                    </label>
                  )}
                  <div className="admin-bot-actions">
                    <button
                      className="admin-secondary"
                      disabled={processing}
                      onClick={() => void rejectCandidate(item)}
                    >
                      Reject
                    </button>
                    {item.ingestionAvailable && !processing && (
                      <button
                        className="admin-submit"
                        disabled={!confirmed || starting}
                        onClick={() => void ingestWebItem(item)}
                      >
                        {starting ? 'Starting...' : failed || stalled ? 'Confirm and Retry' : 'Confirm and Upload'}
                      </button>
                    )}
                    {!item.ingestionAvailable && (
                      <button
                        className="admin-submit"
                        disabled={!confirmed}
                        onClick={() => onPrepareManualUpload?.(item)}
                      >
                        Continue to Manual Upload
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <details className="admin-bot-technical">
          <summary>Search Internet Archive for a specific title</summary>
          <form className="pd-web-search-form" onSubmit={(event) => void searchWeb(event)}>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by title or subject"
              minLength={2}
              required
            />
            <select value={contentKind} onChange={(event) => setContentKind(event.target.value)}>
              <option value="movie">Movies</option>
              <option value="show">Shows</option>
            </select>
            <button className="admin-submit" disabled={searching}>
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>
          {searchResults.map((item) => (
            <p key={item.id}>{item.title} — added to the review queue.</p>
          ))}
        </details>

      </section>

      <div className="admin-bot-divider"><span>Local folder workflow</span></div>

      <div className="admin-bot-heading">
        <div>
          <h2>Public Domain Catalog Automation</h2>
          <p>
            Scan the approved folder, prepare each movie, transcode it, and publish only complete
            catalog entries.
          </p>
        </div>
        <div className="admin-bot-actions">
          <button className="admin-submit" onClick={() => void start(true)} disabled={running}>
            {running ? 'Admin Bot Running' : 'Run Safe Test'}
          </button>
          <button
            className="admin-secondary"
            disabled={running}
            onClick={() => {
              if (globalThis.confirm('This will upload prepared movies to Mux and publish them. Continue?')) {
                void start(false);
              }
            }}
          >
            Publish New Movies
          </button>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}

      <div className="admin-bot-status-card">
        <span className={`admin-bot-status-label admin-bot-status-${job?.status || 'idle'}`}>
          {(job?.status || 'idle').replaceAll('-', ' ')}
        </span>
        <strong>{job?.message || 'Ready to scan the configured Public Domain folder.'}</strong>
        {job?.currentItem && <p>Now processing: {job.currentItem}</p>}
      </div>

      <div className="admin-bot-results">
        {job?.dryRun && (
          <ResultList
            title="Ready for Publishing"
            items={preview}
            emptyMessage="No movies passed the safe test."
            kind="success"
            renderItem={(item) => (
              <>
                <strong>{item.title}</strong>
                <span>{item.message}</span>
              </>
            )}
          />
        )}
        <ResultList
          title="Added Movies"
          items={added}
          emptyMessage="No movies have been added in this run."
          kind={job?.dryRun ? 'neutral' : 'success'}
          renderItem={(item) => (
            <>
              <strong>{item.title}</strong>
              <span>{item.message}</span>
            </>
          )}
        />
        <ResultList
          title="Skipped Movies"
          items={skipped}
          emptyMessage="No previously processed movies were skipped."
          kind="neutral"
          renderItem={(item) => (
            <>
              <strong>{item.fileName}</strong>
              <span>{item.reason}</span>
            </>
          )}
        />
        <ResultList
          title="Needs Attention"
          items={failures}
          emptyMessage="No failures were reported."
          kind="error"
          renderItem={(item) => (
            <>
              <strong>{item.title}</strong>
              <span>{item.message}</span>
            </>
          )}
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
          <h3>Recent Admin Bot Activity</h3>
          <button className="admin-secondary" onClick={() => void load()}>Refresh</button>
        </div>
        {audit.length === 0 ? (
          <p>No Admin Bot activity has been recorded.</p>
        ) : (
          <ul>
            {audit.map((event) => (
              <li key={event.id}>
                <span className={event.type === 'pd.error' ? 'audit-error' : 'audit-success'} />
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
