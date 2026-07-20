const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();


const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Multer in-memory storage configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB max file size
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Exam Prep AI Backend is running smoothly!' });
});

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
    notice: 'Demo Quiz generated. Add your GEMINI_API_KEY in server/.env to get real AI generated questions!'
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
      return res.status(400).json({ error: 'No PDF file was uploaded.' });
    }

    console.log(`Processing PDF: ${file.originalname} (${file.size} bytes)...`);

    // Parse PDF Text
    let pdfData;
    try {
      pdfData = await pdfParse(file.buffer);
    } catch (parseError) {
      console.error('PDF parsing error:', parseError);
      return res.status(400).json({ error: 'Unable to extract text from this PDF file. Please ensure it is a valid text-based PDF.' });
    }

    const extractedText = pdfData.text || '';
    if (extractedText.trim().length < 50) {
      return res.status(400).json({ error: 'The PDF contains too little text or consists of scanned images without text.' });
    }

    console.log(`Extracted ${extractedText.length} characters of text.`);

    const apiKey = process.env.GEMINI_API_KEY;

    // Fallback if no API key is provided
    if (!apiKey || apiKey.trim() === '' || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
      console.log('No Gemini API key found. Using fallback practice quiz generator.');
      const fallbackQuiz = generateFallbackQuiz(extractedText, file.originalname, count);
      fallbackQuiz.timerMinutes = parseInt(timerMinutes, 10) || 10;
      fallbackQuiz.difficulty = difficulty;
      return res.json(fallbackQuiz);
    }

    // Call Gemini API if API key exists
    console.log('Calling Google Gemini AI API...');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' }
    });

    const truncatedText = extractedText.slice(0, 15000); // Limit text chunk size for fast latency

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

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    let parsedQuiz;
    try {
      parsedQuiz = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse AI JSON response:', responseText);
      parsedQuiz = generateFallbackQuiz(extractedText, file.originalname, count);
    }

    parsedQuiz.timerMinutes = parseInt(timerMinutes, 10) || 10;
    parsedQuiz.difficulty = difficulty;
    parsedQuiz.isMockData = false;

    return res.json(parsedQuiz);

  } catch (error) {
    console.error('Error generating quiz:', error);
    return res.status(500).json({ error: 'Server error generating quiz: ' + error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 Exam Prep Backend Server running on port ${PORT}`);
  console.log(`==================================================`);
});
