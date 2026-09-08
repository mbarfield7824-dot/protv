import { useState } from 'react';

const GENRES = [
  'Action', 'Comedy', 'Drama', 'Horror', 'Documentary', 'AI Cinema', 'Food', 'Sports',
  'Sci-Fi', 'Fantasy', 'Romance', 'Thriller', 'Animation',
  'Adventure', 'Crime', 'Family', 'Musical', 'Western',
];

const SUBGENRES = {
  Action: ['Spy', 'Superhero', 'Military', 'Crime'],
  Comedy: ['Romantic', 'Dark', 'Slapstick', 'Political'],
  Drama: ['Historical', 'Biographical', 'Social', 'Personal'],
  Horror: ['Psychological', 'Supernatural', 'Slasher', 'Gothic'],
  'Sci-Fi': ['Dystopian', 'Space', 'Time Travel', 'Cyberpunk'],
};

const COPYRIGHT_STATUSES = [
  'public-domain',
  'creative-commons',
  'original',
  'licensed',
  'unknown',
];

const COMMERCIAL_USE_STATUSES = [
  'verified',
  'requires-verification',
  'not-permitted',
];

const LICENSE_TYPES = [
  'CC-BY-4.0',
  'CC-BY-SA-3.0',
  'CC-BY-NC-4.0',
  'CC0-1.0',
  'Original License',
  'Other',
];

export default function AdminContentForm({ onSubmit, initialData = null }) {
  const [formData, setFormData] = useState(initialData || {
    // Basic metadata
    title: '',
    year: new Date().getFullYear(),
    genre: GENRES[0],
    subgenre: '',
    description: '',
    runtime: 0,
    country: '',

    // Technical
    videoUrl: '',
    trailerUrl: '',
    posterUrl: '',
    backdropUrl: '',
    audioInfo: '',
    subtitleInfo: '',

    // Rights & Legal
    copyrightStatus: COPYRIGHT_STATUSES[3],
    licenseType: LICENSE_TYPES[0],
    rightsHolder: '',
    commercialUseStatus: COMMERCIAL_USE_STATUSES[1],
    attributionRequired: false,
    attributionText: '',
    rightsVerificationNotes: '',
    sourceUrl: '',

    // Approval
    approvalStatus: 'draft',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.title.trim()) {
        throw new Error('Title is required');
      }
      if (!formData.videoUrl.trim()) {
        throw new Error('Video URL is required');
      }
      if (!formData.rightsHolder.trim()) {
        throw new Error('Rights holder is required');
      }
      if (!formData.rightsVerificationNotes.trim()) {
        throw new Error('Rights verification notes are required');
      }

      await onSubmit(formData);

      setSuccess('✅ Content submitted successfully! It has been saved as a draft.');

      // Reset form
      setFormData({
        title: '',
        year: new Date().getFullYear(),
        genre: GENRES[0],
        subgenre: '',
        description: '',
        runtime: 0,
        country: '',
        videoUrl: '',
        trailerUrl: '',
        posterUrl: '',
        backdropUrl: '',
        audioInfo: '',
        subtitleInfo: '',
        copyrightStatus: COPYRIGHT_STATUSES[3],
        licenseType: LICENSE_TYPES[0],
        rightsHolder: '',
        commercialUseStatus: COMMERCIAL_USE_STATUSES[1],
        attributionRequired: false,
        attributionText: '',
        rightsVerificationNotes: '',
        sourceUrl: '',
        approvalStatus: 'draft',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="admin-content-form" onSubmit={handleSubmit}>
      {/* BASIC METADATA SECTION */}
      <fieldset className="form-section">
        <legend>📽️ Basic Content Information</legend>

        <div className="form-row">
          <label>
            Title *
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Enter movie/show title"
              required
            />
          </label>
          <label>
            Year *
            <input
              type="number"
              name="year"
              value={formData.year}
              onChange={handleChange}
              min="1800"
              max={new Date().getFullYear()}
            />
          </label>
        </div>

        <div className="form-row">
          <label>
            Primary Genre *
            <select name="genre" value={formData.genre} onChange={handleChange}>
              {GENRES.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
          <label>
            Sub-Genre (optional)
            <select name="subgenre" value={formData.subgenre} onChange={handleChange}>
              <option value="">Select a sub-genre</option>
              {(SUBGENRES[formData.genre] || []).map(sg => (
                <option key={sg} value={sg}>{sg}</option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Description
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows="3"
            placeholder="Detailed plot synopsis, tone, themes..."
          />
        </label>

        <div className="form-row">
          <label>
            Runtime (minutes)
            <input
              type="number"
              name="runtime"
              value={formData.runtime}
              onChange={handleChange}
              min="0"
            />
          </label>
          <label>
            Country of Origin
            <input
              type="text"
              name="country"
              value={formData.country}
              onChange={handleChange}
              placeholder="e.g., USA, France, Japan"
            />
          </label>
        </div>
      </fieldset>

      {/* TECHNICAL SECTION */}
      <fieldset className="form-section">
        <legend>🎬 Technical Information</legend>

        <label>
          Video URL * (Mux playback URL or direct video file URL)
          <input
            type="url"
            name="videoUrl"
            value={formData.videoUrl}
            onChange={handleChange}
            placeholder="https://image.mux.com/... or https://cdn.example.com/video.mp4"
            required
          />
        </label>

        <label>
          Trailer URL (optional)
          <input
            type="url"
            name="trailerUrl"
            value={formData.trailerUrl}
            onChange={handleChange}
            placeholder="https://..."
          />
        </label>

        <div className="form-row">
          <label>
            Poster URL (optional)
            <input
              type="url"
              name="posterUrl"
              value={formData.posterUrl}
              onChange={handleChange}
              placeholder="https://..."
            />
          </label>
          <label>
            Backdrop URL (optional)
            <input
              type="url"
              name="backdropUrl"
              value={formData.backdropUrl}
              onChange={handleChange}
              placeholder="https://..."
            />
          </label>
        </div>

        <div className="form-row">
          <label>
            Audio Information (optional)
            <input
              type="text"
              name="audioInfo"
              value={formData.audioInfo}
              onChange={handleChange}
              placeholder="e.g., English (5.1), Spanish (2.0)"
            />
          </label>
          <label>
            Subtitle Information (optional)
            <input
              type="text"
              name="subtitleInfo"
              value={formData.subtitleInfo}
              onChange={handleChange}
              placeholder="e.g., English, Spanish, French"
            />
          </label>
        </div>
      </fieldset>

      {/* RIGHTS & LEGAL SECTION - CRITICAL */}
      <fieldset className="form-section form-section-critical">
        <legend>⚖️ Rights & Legal Information (CRITICAL)</legend>
        <p className="section-note">
          ⚠️ DO NOT assume content is commercially usable just because it's free online.
          Verify all rights before submission.
        </p>

        <div className="form-row">
          <label>
            Copyright Status * (What legal basis allows distribution?)
            <select name="copyrightStatus" value={formData.copyrightStatus} onChange={handleChange}>
              <option value="public-domain">Public Domain (verified U.S. public domain)</option>
              <option value="creative-commons">Creative Commons Licensed</option>
              <option value="original">Original Work (rights held by filmmaker)</option>
              <option value="licensed">Licensed from Rights Holder</option>
              <option value="unknown">Unknown / Needs Investigation</option>
            </select>
          </label>
          <label>
            License Type *
            <select name="licenseType" value={formData.licenseType} onChange={handleChange}>
              {LICENSE_TYPES.map(lt => (
                <option key={lt} value={lt}>{lt}</option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Rights Holder / Copyright Owner *
          <input
            type="text"
            name="rightsHolder"
            value={formData.rightsHolder}
            onChange={handleChange}
            placeholder="Individual, studio, archive, or organization that owns/controls rights"
            required
          />
        </label>

        <label>
          Source URL (Where did this content come from?)
          <input
            type="url"
            name="sourceUrl"
            value={formData.sourceUrl}
            onChange={handleChange}
            placeholder="https://archive.org/... or direct source URL"
          />
        </label>

        <div className="form-row">
          <label>
            Commercial Use Status *
            <select name="commercialUseStatus" value={formData.commercialUseStatus} onChange={handleChange}>
              <option value="verified">✅ Verified - Approved for Commercial Streaming</option>
              <option value="requires-verification">🟡 Requires Verification - Need to confirm with rights holder</option>
              <option value="not-permitted">❌ Not Permitted - Cannot be used commercially</option>
            </select>
          </label>
        </div>

        <div className="form-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="attributionRequired"
              checked={formData.attributionRequired}
              onChange={handleChange}
            />
            Attribution Required?
          </label>
        </div>

        {formData.attributionRequired && (
          <label>
            Attribution Text
            <textarea
              name="attributionText"
              value={formData.attributionText}
              onChange={handleChange}
              rows="2"
              placeholder="How to attribute (e.g., '© 2020 Original Filmmaker, CC-BY-4.0')"
            />
          </label>
        )}

        <label>
          Rights Verification Notes * (Document your verification process)
          <textarea
            name="rightsVerificationNotes"
            value={formData.rightsVerificationNotes}
            onChange={handleChange}
            rows="4"
            placeholder={`Examples:
- "Public domain verified via Library of Congress catalog #..."
- "Creator confirmed CC-BY license via email dated ..."
- "License agreement on file with filmmaker ..."
- "Found on Internet Archive with CC-BY license tag"`}
            required
          />
        </label>
      </fieldset>

      {/* APPROVAL SECTION */}
      <fieldset className="form-section">
        <legend>📋 Submission Status</legend>

        <label>
          Save as
          <select name="approvalStatus" value={formData.approvalStatus} onChange={handleChange}>
            <option value="draft">Draft (Save for later)</option>
            <option value="pending-review">Pending Review (Submit for approval)</option>
          </select>
        </label>
      </fieldset>

      {/* MESSAGES */}
      {error && <div className="admin-error">{error}</div>}
      {success && <div className="admin-success">{success}</div>}

      {/* SUBMIT */}
      <div className="form-actions">
        <button type="submit" className="admin-submit" disabled={loading}>
          {loading ? 'Saving...' : formData.approvalStatus === 'draft' ? 'Save as Draft' : 'Submit for Review'}
        </button>
      </div>
    </form>
  );
}
