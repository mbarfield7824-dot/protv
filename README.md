# PROtv - Lightweight Streaming Platform

A free-tier streaming platform MVP built with React, Firebase, and Mux.

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Auth/           # Authentication components
│   ├── Layout/         # Layout (Navbar, etc.)
│   └── Video/          # Video components
├── pages/              # Page components
├── services/           # External API calls (Firebase, Mux)
├── store/              # Zustand state management
└── hooks/              # Custom React hooks
```

## Setup Instructions

### 1. Install Dependencies
```bash
cd protv
npm install
```

### 2. Firebase Setup
1. Create a Firebase project at https://console.firebase.google.com
2. Enable Firestore Database
3. Enable Authentication (Email/Password)
4. Get your credentials from Project Settings

### 3. Environment Variables
1. Copy `.env.example` to `.env.local`
2. Fill in your Firebase credentials:
```
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. Start Development Server
```bash
npm run dev
```

The app will open at http://localhost:5173

## Features (MVP)

- ✅ Home page with featured videos
- ✅ Browse by category
- ✅ Video player page
- ✅ Login/Signup
- ✅ Admin panel to add movies
- ⏳ Mux video integration
- ⏳ Video card components

## Tech Stack

- **Frontend:** React 18 + Vite
- **Database:** Firebase Firestore
- **Auth:** Firebase Authentication
- **Video:** Mux
- **State:** Zustand
- **Styling:** Tailwind CSS

## Next Steps

1. Set up Firestore collection: `/videos`
2. Build VideoCard and VideoGrid components
3. Integrate Mux player
4. Create admin form to add movies
5. Deploy to Vercel

## IP & Licensing

All code is MIT licensed and fully owned by PROtv. Dependencies are carefully selected to ensure no licensing conflicts.
