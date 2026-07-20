
export const BASE_URL = 'https://archi-ai-exam-prep.onrender.com';


export async function checkServerHealth() {
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    console.warn('Backend server not reachable at localhost:5000, using client-side generator mode.', error);
    return false;
  }
}

/**
 * Upload PDF File and generate Quiz questions
 */
export async function generateQuizFromPDF({ file, questionCount = 5, difficulty = 'medium', timerMinutes = 10 }) {
  try {
    const formData = new FormData();
    if (file.file) {
      // Browser File object
      formData.append('file', file.file);
    } else if (file.uri) {
      // Mobile file picker format
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'reference_document.pdf',
        type: file.mimeType || 'application/pdf'
      });
    } else {
      throw new Error('Invalid file format selected.');
    }

    formData.append('questionCount', questionCount.toString());
    formData.append('difficulty', difficulty);
    formData.append('timerMinutes', timerMinutes.toString());

    console.log(`Sending API request to ${BASE_URL}/api/generate-quiz...`);

    const response = await fetch(`${BASE_URL}/api/generate-quiz`, {
      method: 'POST',
      body: formData,
      // Headers handled automatically for multipart/form-data
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server returned status ${response.status}: ${errorText}`);
    }

    const quizData = await response.json();
    return quizData;

  } catch (error) {
    console.error('API Error generating quiz:', error);
    throw error;
  }
}
