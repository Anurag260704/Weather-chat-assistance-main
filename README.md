# 🌤️ Weather Chat Assistant  
*A modern bilingual weather chatbot powered by AI — works best on Google Chrome*

> **Note:** Save your local diagram images to `public/assets/architecture.png` and `public/assets/structure.png` (or update the paths below).

---

## 🎥 Demo Video
👉 **Live Demo:** https://weather-chat-assistance.vercel.app/

---

## 🎞️ Theme Previews

### ☀️ Light Mode (Sakura Animation)  
![Light Mode Preview](/public/Screenshot 2025-11-28 181647.png)

### 🌙 Dark Mode (Snow Animation)  
![Dark Mode Preview](/public/Screenshot 2025-11-28 181653.png)

> 💡 *Replace these GIFs with your own previews anytime.*

---

# 📌 Overview

**Weather Chat Assistant** is a compact, intelligent chatbot built using **Next.js (App Router)**.  
It fetches real-time weather from **OpenWeatherMap** and uses **Google Gemini** to generate short, helpful suggestions about:

- Clothing  
- Activities  
- Safety  
- Food & comfort

Supports both **English** and **Japanese**, with full end-to-end language consistency.

*Chrome recommended due to best Web Speech API performance.*

---

# ✨ Key Features

### 🌐 Bilingual (EN ↔ JA)
- Full language pipeline: **UI → Query → Gemini → Response**  
- Replies always match selected interface language

### 🏙️ Smart City Detection
- Detects EN & JP place names  
- Handles Japanese suffixes (`市`, `県`, `区`)  
- Includes Indian city variants & global cities  
- Graceful fallback on 404 (previous valid city + notice)

### 🌦️ Rich Weather Cards
- Shows the exact city asked by the user  
- Auto-updates unless specified otherwise  
- Displays temp, humidity, wind, condition & more

### 🎙️ Voice Input
- JA/EN Web Speech API  
- Follows same city detection → weather → reply pipeline

### 🎨 Clean UI/UX
- Persistent **dark mode**  
- Sticky header (compact on scroll)  
- Floating **“↓ Latest”** scroll button  
- Fixed bottom chat bar  
- Smooth auto-scroll

### 💬 AI Response Improvements
- Bold key values  
- Highlight safety/gear terms  
- Auto-link URLs  
- Safe HTML formatting

---

# 🔄 How the App Works

1. User types or uses voice (EN/JA).  
2. City detection parses the input.  
3. App fetches weather from OpenWeatherMap.  
   - If invalid → fallback to previous valid city.  
4. Weather + question sent to `/api/gemini`.  
5. Gemini returns a clean, short reply.  
6. UI displays weather card + assistant message.  
7. Scroll updates to latest message.

---
# 📁 Project Structure

![Project Structure]  
*Overview of the Next.js App Router file organization.*

```bash
src/
├── app/
│   ├── api/
│   │   └── gemini/
│   │       └── route.ts        # Server-side Gemini Proxy
│   ├── layout.tsx              # Root layout & Metadata
│   ├── page.tsx                # Main Chat UI Controller
│   └── globals.css             # TailwindCSS + Animations
│
├── components/
│   └── MessageTime.tsx         # Client-only timestamp to fix hydration issues
│
├── hooks/
│   └── useVoiceInput.ts        # Web Speech API (EN/JA)
│
├── lib/
│   ├── api.ts                  # fetchWeather + fetchGeminiResponse
│   ├── constants.ts            # System prompt + model config
│   └── helpers.ts              # Formatters & utilities
│
└── public/
    └── assets/                 # Architecture & Preview images
# Other static files, icons, and animations
---

## 🧩 Why This Structure Works

- UI, logic, and API code separated cleanly  
- `MessageTime.tsx` isolates hydration-sensitive code (timestamps)  
- `/api/gemini` keeps Gemini key server-side (secure)  
- Modular layout makes the app easy to maintain and extend

---

# ⚙️ Setup

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_OPENWEATHER_API_KEY=your_openweather_key
GEMINI_API_KEY=your_gemini_key
Install dependencies:

npm install
Run the development server:

npm run dev
Open the app:
👉 http://localhost:3000

🧪 Quick Functional Test
✔ Language
Switch to 日本語 → Ask → reply should be in Japanese

Switch to English → Ask → reply should be in English

✔ City Detection
Try:

Weather in Delhi

東京の天気教えて

Is it cold in Osaka today?

Expect the weather card to update correctly.

✔ 404 Handling
Ask:

Weather in RandomCityXYZ
→ App falls back to previous valid city + shows a friendly notice

✔ Voice
Tap mic → say “Nagoya no tenki” → should work via Web Speech API

🌐 Deployment
Compatible with:

Vercel (recommended)

Netlify

Cloudflare Pages

Docker / Custom Node server

Add the environment variables in your hosting dashboard. For Vercel, set them in Project → Settings → Environment Variables.

🔒 Security Notes
Never commit .env.local to the repo

Use separate keys for development & production

Rotate API keys immediately if accidentally exposed

Gemini key must remain server-side (use /api/gemini)

📜 License
MIT License — free for personal and commercial use.

❤️ Credits
OpenWeatherMap — Weather data

Google Gemini — AI suggestions

Next.js — Framework

TailwindCSS — Styling
