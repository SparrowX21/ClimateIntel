# ClimateIntel Deployment Guide

## Quick Deploy to Railway (Backend) + Vercel (Frontend)

### Step 1: Deploy Backend to Railway (5 minutes)

1. Go to [railway.app](https://railway.app) and sign up/login
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your ClimateIntel repository
4. Railway will automatically detect Python from `requirements.txt`
5. Add Environment Variables:
   - `GEMINI_API_KEY` = your Gemini API key
6. Click "Deploy"
7. Wait for deployment (2-3 minutes)
8. Copy the Railway URL (e.g., `https://climateintel-backend.railway.app`)

### Step 2: Configure Vercel Frontend (3 minutes)

1. Go to your Vercel project dashboard
2. Go to **Settings → Environment Variables**
3. Add:
   - `VITE_API_URL` = your Railway URL (e.g., `https://climateintel-backend.railway.app`)
4. Go to **Deployments** and click **Redeploy** to apply changes

### Step 3: Test (2 minutes)

1. Open your Vercel URL
2. Click anywhere on the map
3. Should load satellite data and AI analysis

## Local Development

```bash
# Backend
python server.py

# Frontend (new terminal)
npm run dev
```

## Environment Variables

**Backend (.env):**
```
GEMINI_API_KEY=your_gemini_api_key
```

**Frontend (.env):**
```
VITE_API_URL=http://localhost:5000
```

## Troubleshooting

**CORS errors:** Ensure your backend has CORS enabled (Flask-CORS in requirements.txt)

**Earth Engine errors:** You may need to authenticate Earth Engine on Railway (this may require manual setup)

**API errors:** Check that GEMINI_API_KEY is set correctly in Railway environment variables
