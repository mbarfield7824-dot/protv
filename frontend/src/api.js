import { firebaseAuth } from './firebase';

// API client for PROtv backend
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

async function authenticatedHeaders() {
  const user = firebaseAuth?.currentUser;
  return {
    'Content-Type': 'application/json',
    ...(user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}),
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

  async addVideo(videoData) {
    const res = await fetch(`${API_URL}/videos`, {
      method: 'POST',
      headers: await authenticatedHeaders(),
      body: JSON.stringify(videoData),
    });
    return res.json();
  },

  // Step 1 of the file-upload flow: get a Mux direct-upload URL + placeholder video doc
  async getUploadUrl(metadata) {
    const res = await fetch(`${API_URL}/videos/upload-url`, {
      method: 'POST',
      headers: await authenticatedHeaders(),
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
      headers: await authenticatedHeaders(),
      body: JSON.stringify(metadata),
    });
    return res.json();
  },

  // Poll a video's processing status until Mux finishes transcoding
  async getVideoStatus(id) {
    const res = await fetch(`${API_URL}/videos/${id}/status`);
    return res.json();
  },

  async updateVideoMetadata(videoId, metadata) {
    const res = await fetch(`${API_URL}/videos/${encodeURIComponent(videoId)}`, {
      method: 'PATCH',
      headers: await authenticatedHeaders(),
      body: JSON.stringify(metadata),
    });
    const response = await res.json();
    if (!res.ok) throw new Error(response.error || 'Unable to update the video.');
    return response;
  },

  async deleteUnpublishedVideo(videoId) {
    const res = await fetch(`${API_URL}/videos/${encodeURIComponent(videoId)}`, {
      method: 'DELETE',
      headers: await authenticatedHeaders(),
    });
    if (!res.ok) {
      const response = await res.json();
      throw new Error(response.error || 'Unable to remove the video.');
    }
  },

  async claimOwnerAdmin() {
    const res = await fetch(`${API_URL}/videos/admin/claim-owner`, {
      method: 'POST',
      headers: await authenticatedHeaders(),
    });
    const response = await res.json();
    if (!res.ok) throw new Error(response.error || 'Unable to activate owner access.');
    return response;
  },

  // ADMIN: Get all videos (including draft, pending, rejected) for review dashboard
  async getAdminAllVideos() {
    const res = await fetch(`${API_URL}/videos/admin/all`, {
      method: 'GET',
      headers: await authenticatedHeaders(),
    });
    return res.json();
  },

  // ADMIN: Approve a video
  async approveVideo(videoId, approvalNotes) {
    const res = await fetch(`${API_URL}/videos/admin/${videoId}/approve`, {
      method: 'PATCH',
      headers: await authenticatedHeaders(),
      body: JSON.stringify({ approvalNotes }),
    });
    return res.json();
  },

  // ADMIN: Reject a video
  async rejectVideo(videoId, approvalNotes) {
    const res = await fetch(`${API_URL}/videos/admin/${videoId}/reject`, {
      method: 'PATCH',
      headers: await authenticatedHeaders(),
      body: JSON.stringify({ approvalNotes }),
    });
    return res.json();
  },

  // ADMIN: Request rights verification for a video
  async requestVerification(videoId, approvalNotes) {
    const res = await fetch(`${API_URL}/videos/admin/${videoId}/verify`, {
      method: 'PATCH',
      headers: await authenticatedHeaders(),
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

  async getFavorites(token) {
    const res = await fetch(`${API_URL}/users/me/favorites`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Unable to load favorites.');
    return res.json();
  },

  async setFavorite(videoId, favorite, token) {
    const res = await fetch(`${API_URL}/users/me/favorites/${encodeURIComponent(videoId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ favorite }),
    });
    if (!res.ok) throw new Error('Unable to update favorites.');
    return res.json();
  },
};
