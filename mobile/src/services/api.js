import { Platform } from 'react-native';

const RENDER_URL = 'https://archi-ai-exam-prep.onrender.com';
const LOCAL_DEV_URL = Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://localhost:5000';

let cachedBaseUrl = null;

/**
 * Automatically determine the best backend endpoint:
 * Prioritizes local server when running locally, falling back to Render.
 */
export async function getActiveBaseUrl() {
  if (cachedBaseUrl) return cachedBaseUrl;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${LOCAL_DEV_URL}/api/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      console.log(`Connected to local AI backend: ${LOCAL_DEV_URL}`);
      cachedBaseUrl = LOCAL_DEV_URL;
      return LOCAL_DEV_URL;
    }
  } catch (_) {
    // Local server not available, use Render cloud server
  }

  console.log(`Using cloud AI backend: ${RENDER_URL}`);
  cachedBaseUrl = RENDER_URL;
  return RENDER_URL;
}

export const BASE_URL = LOCAL_DEV_URL;

export async function checkServerHealth() {
  try {
    const baseUrl = await getActiveBaseUrl();
    const response = await fetch(`${baseUrl}/api/health`);
    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    console.warn('Backend server health check failed:', error);
    return false;
  }
}

/**
 * Upload PDF File and generate Quiz questions
 */
export async function generateQuizFromPDF({ file, questionCount = 5, difficulty = 'medium', timerMinutes = 10 }) {
  try {
    const baseUrl = await getActiveBaseUrl();
    const formData = new FormData();

    if (file.file) {
      // Browser File object (Web preview)
      formData.append('file', file.file);
    } else if (file.uri) {
      // Mobile file picker format (Expo document picker)
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'reference_document.pdf',
        type: file.mimeType || 'application/pdf'
      });
    } else {
      throw new Error('Invalid file format selected. Please select a valid PDF file.');
    }

    formData.append('questionCount', questionCount.toString());
    formData.append('difficulty', difficulty);
    formData.append('timerMinutes', timerMinutes.toString());

    console.log(`Sending API request to ${baseUrl}/api/generate-quiz...`);

    const response = await fetch(`${baseUrl}/api/generate-quiz`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = `Server returned status ${response.status}`;
      try {
        const errorJson = await response.json();
        if (errorJson && errorJson.error) {
          errorMessage = errorJson.error;
        }
      } catch (_) {
        const errorText = await response.text();
        if (errorText) errorMessage = errorText;
      }
      throw new Error(errorMessage);
    }

    const quizData = await response.json();
    return quizData;

  } catch (error) {
    console.error('API Error generating quiz:', error);
    throw error;
  }
}
