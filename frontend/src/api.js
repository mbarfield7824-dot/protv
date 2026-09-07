// API client for PROtv backend
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Temporary: until real user login/auth exists, the Admin page uses a
// shared admin key (set VITE_ADMIN_API_KEY in frontend/.env, matching
// ADMIN_API_KEY in backend/.env) instead of a Firebase ID token.
function adminHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-admin-key': import.meta.env.VITE_ADMIN_API_KEY || '',
  };
}

export const api = {
  // Videos
  async getVideos() {
    try {
      const res = await fetch(`${API_URL}/videos`);
      if (!res.ok) return [];
      return res.json();
    } catch {
      return [];
    }
  },

  async getVideo(id) {
    try {
      const res = await fetch(`${API_URL}/videos/${id}`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  async getCategories() {
    try {
      const res = await fetch(`${API_URL}/videos/categories/list`);
      if (!res.ok) return [];
      return res.json();
    } catch {
      return [];
    }
  },

  async addVideo(videoData, token) {
    const res = await fetch(`${API_URL}/videos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(videoData),
    });
    return res.json();
  },

  // Step 1 of the file-upload flow: get a Mux direct-upload URL + placeholder video doc
  async getUploadUrl(metadata) {
    const res = await fetch(`${API_URL}/videos/upload-url`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(metadata),
    });
    return res.json();
  },

  // Step 2 of the file-upload flow: PUT the raw file bytes straight to Mux
  async uploadFileToMux(uploadUrl, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Upload failed: ${xhr.status}`));
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(file);
    });
  },

  // "Paste a URL" flow: ingest an already-hosted video file directly, no upload needed
  async addVideoFromUrl(metadata) {
    const res = await fetch(`${API_URL}/videos/from-url`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(metadata),
    });
    return res.json();
  },

  // Poll a video's processing status until Mux finishes transcoding
  async getVideoStatus(id) {
    const res = await fetch(`${API_URL}/videos/${id}/status`);
    return res.json();
  },

  // ADMIN: Get all videos (including draft, pending, rejected) for review dashboard
  async getAdminAllVideos(token) {
    const res = await fetch(`${API_URL}/videos/admin/all`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': import.meta.env.VITE_ADMIN_API_KEY || '',
      },
    });
    return res.json();
  },

  // ADMIN: Approve a video
  async approveVideo(videoId, approvalNotes, token) {
    const res = await fetch(`${API_URL}/videos/admin/${videoId}/approve`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': import.meta.env.VITE_ADMIN_API_KEY || '',
      },
      body: JSON.stringify({ approvalNotes }),
    });
    return res.json();
  },

  // ADMIN: Reject a video
  async rejectVideo(videoId, approvalNotes, token) {
    const res = await fetch(`${API_URL}/videos/admin/${videoId}/reject`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': import.meta.env.VITE_ADMIN_API_KEY || '',
      },
      body: JSON.stringify({ approvalNotes }),
    });
    return res.json();
  },

  // ADMIN: Request rights verification for a video
  async requestVerification(videoId, approvalNotes, token) {
    const res = await fetch(`${API_URL}/videos/admin/${videoId}/verify`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': import.meta.env.VITE_ADMIN_API_KEY || '',
      },
      body: JSON.stringify({ approvalNotes }),
    });
    return res.json();
  },

  // Auth
  async signup(email, password, displayName) {
    const res = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    });
    return res.json();
  },
};
