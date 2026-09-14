import os
import io
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pypdf import PdfReader
from quiz_agent import QuizAgent, index_pdf_text

# Load environment variables
load_dotenv()

app = FastAPI(title="Archi AI Quiz Agent Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Quiz Agent
agent = None
try:
    agent = QuizAgent()
except Exception as e:
    print(f"Error initializing QuizAgent: {e}. Make sure GEMINI_API_KEY is set in environment.")

@app.get("/health")
def health_check():
    return {"status": "ok", "agent_loaded": agent is not None}

@app.post("/generate-quiz")
async def generate_quiz(
    file: UploadFile = File(...),
    questionCount: int = Form(5),
    difficulty: str = Form("medium"),
    timerMinutes: int = Form(10)
):
    global agent
    if agent is None:
        try:
            agent = QuizAgent()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Gemini API key is not configured on agent. {str(e)}")

    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        # Read PDF content
        pdf_content = await file.read()
        pdf_file = io.BytesIO(pdf_content)
        
        reader = PdfReader(pdf_file)
        full_text = ""
        for page in reader.pages:
            text = page.extract_text()
            if text:
                full_text += text + "\n"
                
        if len(full_text.strip()) < 50:
            raise HTTPException(status_code=400, detail="Could not extract enough text from the PDF. Ensure it is not a scanned image.")

        # Index text in the agent's cache (RAG context)
        index_pdf_text(file.filename, full_text)
        
        # Generate Quiz using the Agent
        quiz_data = agent.generate_quiz(
            doc_name=file.filename,
            question_count=questionCount,
            difficulty=difficulty
        )
        
        # Add metadata expected by mobile frontend
        quiz_data["timerMinutes"] = timerMinutes
        quiz_data["difficulty"] = difficulty
        quiz_data["isMockData"] = False
        
        return quiz_data

    except Exception as e:
        print(f"Error processing quiz: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
