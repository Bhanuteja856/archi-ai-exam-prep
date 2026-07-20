# How to Get a Free Google Gemini API Key

Follow these quick steps (takes less than 1 minute) to enable full AI quiz generation for your sister:

1. **Go to Google AI Studio**:
   Open your browser and navigate to: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

2. **Sign In**:
   Sign in with any standard Google account.

3. **Create API Key**:
   - Click the blue button: **"Create API Key"** (or **"Get API key"**).
   - Select or create a project.
   - Copy the generated API Key string (starts with `AIzaSy...`).

4. **Paste into the App**:
   - Open [server/.env](file:///d:/batman/Archi/server/.env) in your editor.
   - Paste your key next to `GEMINI_API_KEY=`:
     ```env
     PORT=5000
     GEMINI_API_KEY=AIzaSyYourActualKeyHere
     ```
   - Save the file. The server will automatically reload and start serving real AI-generated exam questions!

---

## Testing & Running the App

### 1. Start the Backend API Server:
```bash
cd server
npm start
```
*(Server runs on `http://localhost:5000`)*

### 2. Start the Mobile App (Web & Mobile preview):
```bash
cd mobile
npm run web
```
This opens the mobile app right in your desktop web browser so you can immediately upload PDFs and try quizzes!

### 3. Test on Physical Phone (Android / iOS):
- Install **Expo Go** from Google Play Store or Apple App Store on your phone.
- Run `npx expo start` inside the `mobile` folder.
- Scan the QR code with your phone camera or Expo Go app to test live on mobile!

### 4. Build Installable Android APK file (to give to your sister):
```bash
cd mobile
npx eas-cli build -p android --profile preview
```
This produces a direct `.apk` file that your sister can install on her Android phone without needing any developer setup!
