# AI Exam Prep & PDF Quiz Generator Mobile App

Build an intuitive, AI-powered mobile app tailored for government exam preparation. The app allows users to upload study PDFs (notes, syllabus, reference materials), automatically extract content, and generate customized interactive quizzes using AI (Google Gemini API).

---

## Technical Stack Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Mobile App (React Native + Expo)               │
│  - Document Picker (Upload PDF)                            │
│  - Quiz Player UI (Timer, MCQ Selection, Explanations)     │
│  - Score & Analytics Summary                               │
│  - Saved Quizzes & Study History                           │
└──────────────┬──────────────────────────────▲───────────────┘
               │                              │
               │ HTTP API Request             │ JSON Quiz Output
               ▼                              │
┌─────────────────────────────────────────────┴──────────────┐
│              Backend Service (Node.js + Express)            │
│  - PDF Text Extraction (`pdf-parse`)                        │
│  - Gemini API Prompt Engine (Structured JSON Quiz Gen)      │
│  - Local / Cloud Database (Supabase or SQLite)              │
└─────────────────────────────────────────────────────────────┘
```

### Stack Details:
- **Frontend**: **React Native (Expo SDK)** with TypeScript & React Navigation.
  - *Why*: Capitalizes on your web development experience (React/JS), supports hot reloading, and compiles natively for both Android & iOS.
- **Backend API**: **Node.js (Express)**.
  - *Why*: Securely manages your AI API keys, handles server-side PDF parsing reliably, and structures prompts cleanly.
- **AI Integration**: **Google Gemini 2.5 Flash / Pro API** (Fast, cost-effective/free tier, excellent JSON mode for structuring quiz data).
- **Storage**: Local SQLite / AsyncStorage (for offline cache & quiz history) + Supabase (optional backend cloud sync).

---

## Key Features & Phased Roadmap

### Phase 1: Core Setup & UI Foundation
- Setup Expo React Native TypeScript application.
- Establish design system (clean, modern exam prep UI with high contrast, dark/light themes, smooth transitions).
- Setup Node.js Express backend server for PDF processing & AI integration.

### Phase 2: PDF Upload & AI Quiz Generation Engine
- Document Picker component to select study PDFs from phone storage.
- Backend PDF parsing to extract raw text content.
- AI prompt engineering sending parsed text to Gemini API to return structured JSON quizzes (Question, 4 Options, Correct Answer Index, Detailed Explanation).
- Interactive Quiz Player screen (Card flip animations, immediate feedback, progress bar).

### Phase 3: Customization & Practice Enhancements
- Configurable settings prior to quiz generation:
  - **Question Count** (e.g., 5, 10, 20 questions).
  - **Timer Options** (Untimed mode, Per-question timer, Total quiz timer).
  - **Difficulty Level** (Easy, Medium, Hard exam level).
- Score Summary Screen with score analytics, review mode for missed questions, and bookmarks.
- Quiz History & Saved PDF repository.

### Phase 4: Building & Mobile Deployment
- Android APK generation via Expo CLI / EAS Build.
- Deployment guide for running directly on Android device or publishing to Google Play Store / Apple App Store.

---

## User Review Required

> [!IMPORTANT]
> **API Key Choice**: We recommend using the Google Gemini API (Gemini 2.5 Flash) which offers a generous free tier for personal projects. Do you have a Gemini API key or would you like guidance on creating a free one?

> [!NOTE]
> **Architecture Setup**: We will set up both the mobile app (`frontend`) and the Express server (`backend`) in your workspace so you can run and test everything on your computer/phone smoothly.

---

## Verification Plan

### Automated & Integration Verification
- Backend API testing (`npm test` / API endpoint validation with test PDFs).
- JSON schema validation to guarantee AI responses are formatted correctly as structured quiz objects.

### Manual Verification
- Testing PDF upload with real government exam preparation PDF files.
- Verifying quiz timer functionality, scoring calculations, and answer explanations.
- Testing app execution on Expo Go / Android Emulator.
