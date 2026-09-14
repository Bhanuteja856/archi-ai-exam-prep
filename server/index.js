const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const { extractText } = require('unpdf');
let pdfParse = null;
try {
  pdfParse = require('pdf-parse');
} catch (_) {}
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Multer in-memory storage configuration (Max 25 MB file size)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Exam Prep AI Backend is running smoothly!' });
});

/**
 * Robust multi-engine PDF Text Extractor
 */
async function extractPdfContent(fileBuffer) {
  // Engine 1: unpdf (Modern, high-fidelity, universal parser)
  try {
    const uint8 = new Uint8Array(fileBuffer);
    const { text, totalPages } = await extractText(uint8);
    const fullText = Array.isArray(text) ? text.join('\n\n') : (text || '');
    if (fullText.trim().length > 30) {
      return { text: fullText, numpages: totalPages || 1 };
    }
  } catch (unpdfErr) {
    console.warn('unpdf parser notice:', unpdfErr.message);
  }

  // Engine 2: pdf-parse fallback
  if (pdfParse) {
    try {
      const data = await pdfParse(fileBuffer);
      if (data && data.text && data.text.trim().length > 30) {
        return { text: data.text, numpages: data.numpages || 1 };
      }
    } catch (pdfParseErr) {
      console.warn('pdf-parse fallback notice:', pdfParseErr.message);
    }
  }

  throw new Error('Could not extract readable text from this PDF. Please verify it is a valid text-based document.');
}

/**
 * Generate mock questions fallback if no API key is provided
 */
function generateFallbackQuiz(pdfText, fileName, questionCount = 5) {
  const cleanText = pdfText.replace(/\s+/g, ' ').trim();
  const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  const questions = [];
  const topicName = fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

  for (let i = 0; i < Math.min(questionCount, Math.max(sentences.length, 5)); i++) {
    const mainSentence = sentences[i % sentences.length] || `Key reference topic regarding ${topicName}.`;
    const words = mainSentence.trim().split(' ');
    const keyWord = words.length > 3 ? words[Math.floor(words.length / 2)] : 'Concept';

    questions.push({
      id: `q_${i + 1}_${Date.now()}`,
      question: `[Practice Q${i + 1}] Based on ${topicName}: What is the significance of "${keyWord}" in the following context?\n"${mainSentence.trim()}."`,
      options: [
        `It defines the core principle of ${keyWord} as detailed in the study notes.`,
        `It represents an alternative theoretical exception in government exam syllabus.`,
        `It is an outdated historical reference superseded by modern amendments.`,
        `It serves as an administrative guideline for procedure evaluation.`
      ],
      correctAnswer: 0,
      explanation: `According to the reference document "${fileName}", "${mainSentence.trim()}" directly supports Option A. Focus on this key sentence during your final revision.`
    });
  }

  return {
    title: `Quiz: ${topicName}`,
    documentName: fileName,
    totalQuestions: questions.length,
    questions: questions,
    isMockData: true,
    notice: 'Practice Quiz generated. Add your GEMINI_API_KEY in server/.env for live Google Gemini questions!'
  };
}

/**
 * Endpoint to generate Quiz from PDF
 */
app.post('/api/generate-quiz', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const { questionCount = 5, difficulty = 'medium', timerMinutes = 10 } = req.body;
    const count = parseInt(questionCount, 10) || 5;

    if (!file) {
      return res.status(400).json({ error: 'No PDF file was uploaded. Please choose a PDF file.' });
    }

    console.log(`Processing PDF: ${file.originalname} (${file.size} bytes)...`);

    let extractedText = '';
    let pageCount = 1;

    try {
      const result = await extractPdfContent(file.buffer);
      extractedText = result.text;
      pageCount = result.numpages;
    } catch (parseError) {
      console.error('PDF parsing error:', parseError.message);
      return res.status(400).json({ 
        error: 'Unable to extract text from this PDF file. Please ensure it is a text-based document (not a scanned image or photo).'
      });
    }

    if (extractedText.trim().length < 50) {
      return res.status(400).json({ 
        error: 'The PDF contains too little selectable text. Please ensure it contains readable text and is not a scanned image.' 
      });
    }

    console.log(`Extracted ${extractedText.length} characters of text across ${pageCount} page(s).`);

    // 1. Try routing to Python AI Agent Service if active
    try {
      const agentForm = new FormData();
      const fileBlob = new Blob([file.buffer], { type: 'application/pdf' });
      agentForm.append('file', fileBlob, file.originalname);
      agentForm.append('questionCount', count.toString());
      agentForm.append('difficulty', difficulty);
      agentForm.append('timerMinutes', timerMinutes.toString());

      const agentResponse = await fetch('http://localhost:8000/generate-quiz', {
        method: 'POST',
        body: agentForm,
        signal: AbortSignal.timeout(2500)
      });

      if (agentResponse.ok) {
        const quizData = await agentResponse.json();
        console.log('🚀 Quiz generated successfully by the Python AI Agent!');
        return res.json(quizData);
      }
    } catch (agentError) {
      // Python agent is offline; seamlessly fall back to Express native generator
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // Fallback if no API key is provided
    if (!apiKey || apiKey.trim() === '' || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
      console.log('No Gemini API key found. Using fallback practice quiz generator.');
      const fallbackQuiz = generateFallbackQuiz(extractedText, file.originalname, count);
      fallbackQuiz.timerMinutes = parseInt(timerMinutes, 10) || 10;
      fallbackQuiz.difficulty = difficulty;
      return res.json(fallbackQuiz);
    }

    // Call Gemini API directly
    console.log('Calling Google Gemini AI API directly from Express...');
    const genAI = new GoogleGenerativeAI(apiKey);

    // Provide up to 60,000 characters (~15,000 words) for deep exam question generation
    const truncatedText = extractedText.slice(0, 60000);

    const prompt = `
You are an expert exam creator for competitive government exams.
Analyze the following reference document text and create exactly ${count} multiple-choice practice questions at ${difficulty} difficulty level.

Strictly format your response as a JSON object matching this schema:
{
  "title": "Quiz Title based on Document Topic",
  "documentName": "${file.originalname}",
  "totalQuestions": ${count},
  "questions": [
    {
      "id": "q1",
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Detailed explanation of why Option A is correct based on the text."
    }
  ]
}

Note: "correctAnswer" MUST be an integer index (0 for Option A, 1 for Option B, 2 for Option C, 3 for Option D).

DOCUMENT TEXT:
${truncatedText}
`;

    // Try available active Gemini models in sequence
    const candidateModels = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];
    let responseText = null;

    for (const modelName of candidateModels) {
      try {
        console.log(`Attempting quiz generation with ${modelName}...`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: 'application/json' }
        });
        const result = await model.generateContent(prompt);
        responseText = result.response.text();
        if (responseText) {
          console.log(`Quiz generated successfully using ${modelName}!`);
          break;
        }
      } catch (geminiError) {
        console.warn(`Model ${modelName} issue: ${geminiError.message}`);
      }
    }

    let parsedQuiz;
    if (responseText) {
      try {
        parsedQuiz = JSON.parse(responseText);
      } catch (jsonErr) {
        console.error('Failed to parse AI JSON response, falling back:', jsonErr);
        parsedQuiz = generateFallbackQuiz(extractedText, file.originalname, count);
      }
    } else {
      console.warn('All Gemini models failed or timed out. Using fallback generator.');
      parsedQuiz = generateFallbackQuiz(extractedText, file.originalname, count);
    }

    parsedQuiz.timerMinutes = parseInt(timerMinutes, 10) || 10;
    parsedQuiz.difficulty = difficulty;
    parsedQuiz.isMockData = !responseText;

    return res.json(parsedQuiz);

  } catch (error) {
    console.error('Error generating quiz:', error);
    return res.status(500).json({ error: 'Server error generating quiz: ' + error.message });
  }
});

// Multer error handling middleware (e.g. file size limit exceeded)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'PDF file is too large. The maximum supported file size is 25 MB.'
      });
    }
    return res.status(400).json({ error: `File upload error: ${err.message}` });
  } else if (err) {
    return res.status(500).json({ error: err.message || 'An unexpected server error occurred.' });
  }
  next();
});

// Start Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 Exam Prep Backend Server running on port ${PORT}`);
  console.log(`==================================================`);
});
