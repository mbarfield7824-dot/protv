# PROtv Backend Setup Guide

## What We've Built
- **Express.js** API server with routes for auth and videos
- **Firebase** integration (Firestore database + Authentication)
- **Modular structure** ready for Roku/Firestick apps later

## Project Structure
```
backend/
├── src/
│   ├── server.js           # Main Express app
│   ├── firebase.js         # Firebase config & helpers
│   ├── routes/
│   │   ├── auth.js         # Login/signup endpoints
│   │   └── videos.js       # Video endpoints
│   └── middleware/
│       └── auth.js         # Token verification
├── package.json            # Dependencies
├── .env.example            # Environment variables template
└── .env                    # Your actual secrets (create from .env.example)
```

## Setup Steps

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add project" and name it "PROtv"
3. Enable Firestore Database
4. Enable Authentication (Email/Password)
5. Go to Project Settings > Service Accounts > Generate new private key
6. Download and save as `serviceAccountKey.json` in the backend folder

### 2. Set Environment Variables
```bash
# Copy the template
cp .env.example .env

# Edit .env and add:
# - Path to your serviceAccountKey.json
# - Your Firebase Project ID (from console)
# - Keep PORT as 5000
```

### 3. Install & Run
```bash
# Install dependencies (already done)
npm install

# Start the server
npm start

# You should see:
# ✓ PROtv Backend running on port 5000
```

### 4. Test with Postman
1. Download [Postman](https://www.postman.com/downloads/)
2. Create requests to test:
   - `GET http://localhost:5000/health` → Should return `{ status: "Backend is running!" }`
   - `GET http://localhost:5000/videos` → Should return empty array `[]`

### Owner access

Content uploads, catalog edits, reviews, and Mux ingestion require a Firebase
custom claim. In Vercel, add a protected `OWNER_EMAIL` environment variable
containing the email address of the PROtv owner account. Deploy it, then sign in
to `/admin` with that account and select **Activate Owner Access** once. Sign
out and back in afterward so Firebase issues the account a token with the admin
claim.

For a local backend with valid Firebase Admin credentials, the equivalent is:
```bash
npm run grant-admin -- owner@example.com
```

## API Endpoints (Phase 1)

### Auth Routes
- `POST /auth/signup` - Create account
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "displayName": "John Doe"
  }
  ```

### Video Routes
- `GET /videos` - Get all videos
- `GET /videos/:id` - Get single video
- `GET /videos/categories/list` - Get all categories
- `POST /videos` - Add new video (requires authentication token)

## Next Steps
1. Set up Firebase project ✓
2. Test backend with Postman
3. Build database schema (videos, categories, users)
4. Set up frontend (React + Vite)
5. Connect frontend to backend
6. Integrate Mux for video streaming

## Troubleshooting
- **Port already in use**: Change `PORT` in `.env`
- **Firebase auth error**: Check `serviceAccountKey.json` path in `.env`
- **CORS errors**: Check `FRONTEND_URL` in `.env`
