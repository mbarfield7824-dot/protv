import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const APPROVAL_STATUSES = {
  draft: { label: '📝 Draft', color: '#707070', bg: '#1a1a1a' },
  'pending-review': { label: '🟡 Pending Review', color: '#FFD700', bg: '#1a1a00' },
  approved: { label: '✅ Approved', color: '#4ADE80', bg: '#001a00' },
  rejected: { label: '❌ Rejected', color: '#FF6B6B', bg: '#1a0000' },
  'rights-verification-required': { label: '⚠️ Verify Rights', color: '#FF9500', bg: '#1a0a00' },
};

const COMMERCIAL_STATUSES = {
  verified: { label: '✅ Verified', color: '#4ADE80' },
  'requires-verification': { label: '🟡 Needs Verification', color: '#FFD700' },
  'not-permitted': { label: '❌ Not Permitted', color: '#FF6B6B' },
};

export default function AdminContentReview() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [actionNotes, setActionNotes] = useState('');

  const fetchVideos = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.getAdminAllVideos();
      setVideos(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load content');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void fetchVideos();
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [fetchVideos]);

  const filteredVideos = useMemo(() => {
    let filtered = videos;

    if (searchQuery) {
      filtered = filtered.filter((video) =>
        video.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter) {
      filtered = filtered.filter((video) => video.approvalStatus === statusFilter);
    }

    if (genreFilter) {
      filtered = filtered.filter((video) => video.genre === genreFilter);
    }

    return filtered;
  }, [videos, searchQuery, statusFilter, genreFilter]);

  const handleApprove = async (videoId) => {
    try {
      setActionInProgress('approve');
      await api.approveVideo(videoId, actionNotes);
      setActionNotes('');
      setSelectedVideo(null);
      await fetchVideos();
    } catch (err) {
      alert(`Error approving: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async (videoId) => {
    try {
      setActionInProgress('reject');
      await api.rejectVideo(videoId, actionNotes);
      setActionNotes('');
      setSelectedVideo(null);
      await fetchVideos();
    } catch (err) {
      alert(`Error rejecting: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRequestVerification = async (videoId) => {
    try {
      setActionInProgress('verify');
      await api.requestVerification(videoId, actionNotes);
      setActionNotes('');
      setSelectedVideo(null);
      await fetchVideos();
    } catch (err) {
      alert(`Error requesting verification: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const getUniqueGenres = () => {
    const genres = new Set(videos.map(v => v.genre).filter(Boolean));
    return Array.from(genres).sort();
  };

  if (loading) {
    return <div className="admin-review-loading">Loading content...</div>;
  }

  return (
    <div className="admin-review-container">
      {error && <div className="admin-error">{error}</div>}

      {/* FILTERS */}
      <div className="admin-review-filters">
        <input
          type="text"
          placeholder="🔍 Search by title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="admin-search-input"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="admin-filter-select"
        >
          <option value="">All Statuses</option>
          <option value="draft">📝 Draft</option>
          <option value="pending-review">🟡 Pending Review</option>
          <option value="approved">✅ Approved</option>
          <option value="rejected">❌ Rejected</option>
          <option value="rights-verification-required">⚠️ Needs Verification</option>
        </select>

        <select
          value={genreFilter}
          onChange={(e) => setGenreFilter(e.target.value)}
          className="admin-filter-select"
        >
          <option value="">All Genres</option>
          {getUniqueGenres().map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>

        <button onClick={fetchVideos} className="admin-refresh-btn">
          🔄 Refresh
        </button>
      </div>

      {/* CONTENT LIST */}
      <div className="admin-review-list">
        <div className="admin-review-header">
          <span>{filteredVideos.length} items</span>
        </div>

        {filteredVideos.length === 0 ? (
          <p className="admin-empty-state">No content found.</p>
        ) : (
          filteredVideos.map((video) => {
            const statusInfo = APPROVAL_STATUSES[video.approvalStatus] || APPROVAL_STATUSES.draft;
            const commercialInfo = COMMERCIAL_STATUSES[video.commercialUseStatus] || COMMERCIAL_STATUSES['requires-verification'];

            return (
              <div
                key={video.id}
                className="admin-review-item"
                onClick={() => setSelectedVideo(video)}
                style={{
                  borderLeft: `4px solid ${statusInfo.color}`,
                  background: selectedVideo?.id === video.id ? 'rgba(65, 105, 225, 0.1)' : 'transparent',
                }}
              >
                <div className="review-item-main">
                  <div>
                    <h4 className="review-item-title">{video.title}</h4>
                    <div className="review-item-meta">
                      <span style={{ color: statusInfo.color }}>
                        {statusInfo.label}
                      </span>
                      <span>•</span>
                      <span>{video.year || '—'}</span>
                      <span>•</span>
                      <span>{video.genre}</span>
                      <span>•</span>
                      <span style={{ color: commercialInfo.color }}>
                        {commercialInfo.label}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedVideo?.id === video.id && (
                  <div className="review-item-detail">
                    <div className="detail-section">
                      <h5>Description</h5>
                      <p>{video.description || '(No description)'}</p>
                    </div>

                    <div className="detail-section">
                      <h5>Rights & Legal</h5>
                      <table className="detail-table">
                        <tbody>
                          <tr>
                            <td>Copyright Status:</td>
                            <td>{video.copyrightStatus}</td>
                          </tr>
                          <tr>
                            <td>License Type:</td>
                            <td>{video.licenseType}</td>
                          </tr>
                          <tr>
                            <td>Rights Holder:</td>
                            <td>{video.rightsHolder}</td>
                          </tr>
                          <tr>
                            <td>Source URL:</td>
                            <td>
                              {video.sourceUrl ? (
                                <a href={video.sourceUrl} target="_blank" rel="noopener noreferrer">
                                  {video.sourceUrl}
                                </a>
                              ) : '—'}
                            </td>
                          </tr>
                          <tr>
                            <td>Commercial Use:</td>
                            <td style={{ color: commercialInfo.color, fontWeight: 'bold' }}>
                              {commercialInfo.label}
                            </td>
                          </tr>
                          <tr>
                            <td>Attribution Required:</td>
                            <td>{video.attributionRequired ? 'Yes' : 'No'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="detail-section">
                      <h5>Verification Notes</h5>
                      <p className="verification-notes">{video.rightsVerificationNotes}</p>
                    </div>

                    <div className="detail-section">
                      <h5>Approval History</h5>
                      <p>
                        Submitted: {new Date(video.submittedAt?.toDate?.() || video.submittedAt).toLocaleDateString()}
                        {video.approvedAt && (
                          <>
                            <br />
                            Approved: {new Date(video.approvedAt.toDate?.() || video.approvedAt).toLocaleDateString()}
                          </>
                        )}
                        {video.approvedBy && (
                          <>
                            <br />
                            By: {video.approvedBy}
                          </>
                        )}
                      </p>
                      {video.approvalNotes && (
                        <p>
                          <strong>Notes:</strong> {video.approvalNotes}
                        </p>
                      )}
                    </div>

                    {/* ACTION BUTTONS */}
                    {['draft', 'pending-review', 'rights-verification-required'].includes(video.approvalStatus) && (
                      <div className="detail-section">
                        <h5>Admin Actions</h5>
                        <textarea
                          placeholder="Add notes (optional)..."
                          value={actionNotes}
                          onChange={(e) => setActionNotes(e.target.value)}
                          rows="2"
                          className="admin-action-notes"
                        />
                        <div className="action-buttons">
                          <button
                            onClick={() => handleApprove(video.id)}
                            disabled={actionInProgress === 'approve'}
                            className="btn btn-approve"
                          >
                            {actionInProgress === 'approve' ? '...' : '✅ Approve'}
                          </button>
                          <button
                            onClick={() => handleRequestVerification(video.id)}
                            disabled={actionInProgress === 'verify'}
                            className="btn btn-verify"
                          >
                            {actionInProgress === 'verify' ? '...' : '⚠️ Request Verification'}
                          </button>
                          <button
                            onClick={() => handleReject(video.id)}
                            disabled={actionInProgress === 'reject'}
                            className="btn btn-reject"
                          >
                            {actionInProgress === 'reject' ? '...' : '❌ Reject'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
