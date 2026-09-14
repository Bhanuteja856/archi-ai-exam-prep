import os
import re
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.tools import tool
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from tavily import TavilyClient

# Pydantic schema for the generated quiz questions
class QuestionModel(BaseModel):
    id: str = Field(description="Unique question identifier, e.g. q1, q2")
    question: str = Field(description="The multiple choice question text")
    options: List[str] = Field(description="Exactly 4 options for the answer")
    correctAnswer: int = Field(description="0-indexed integer indicating the correct option (0=A, 1=B, 2=C, 3=D)")
    explanation: str = Field(description="Detailed explanation of why the correct option is right, referencing the study material")

class QuizModel(BaseModel):
    title: str = Field(description="Quiz title based on the document topic")
    documentName: str = Field(description="Name of the reference document")
    totalQuestions: int = Field(description="Total number of questions in the quiz")
    questions: List[QuestionModel] = Field(description="List of quiz questions")

# Global PDF text storage to simulate a vector store or document retriever
_pdf_text_cache = {}

def index_pdf_text(doc_name: str, full_text: str):
    """Store the extracted text in cache for retrieval tools."""
    _pdf_text_cache[doc_name] = full_text

@tool
def retrieve_study_material(query: str, doc_name: str) -> str:
    """Useful to search and retrieve relevant text chunks from the uploaded study document."""
    text = _pdf_text_cache.get(doc_name, "")
    if not text:
        return "No study material found for this document."
    
    # Simple keyword-based chunk retrieval (pure Python, extremely reliable)
    paragraphs = [p.strip() for p in re.split(r'\n{2,}', text) if p.strip()]
    if not paragraphs:
        paragraphs = [s.strip() for s in text.split('.') if s.strip()]
        
    keywords = [w.lower() for w in query.split() if len(w) > 3]
    if not keywords:
        return "\n\n".join(paragraphs[:5]) # Fallback to first few paragraphs
        
    scored_paragraphs = []
    for p in paragraphs:
        score = sum(1 for kw in keywords if kw in p.lower())
        if score > 0:
            scored_paragraphs.append((score, p))
            
    scored_paragraphs.sort(key=lambda x: x[0], reverse=True)
    results = [p for _, p in scored_paragraphs[:5]]
    
    if not results:
        return "\n\n".join(paragraphs[:5])
        
    return "\n\n".join(results)

@tool
def web_search(query: str) -> str:
    """Useful to search the web for external context, recent amendments, or validation of facts."""
    tavily_key = os.getenv("TAVILY_API_KEY")
    if not tavily_key or tavily_key == "YOUR_TAVILY_API_KEY_HERE":
        return "Web search is disabled. No Tavily API key provided."
    try:
        client = TavilyClient(api_key=tavily_key)
        response = client.search(query=query, max_results=3)
        results = []
        for r in response.get("results", []):
            results.append(f"Title: {r.get('title')}\nContent: {r.get('content')}\nURL: {r.get('url')}\n")
        return "\n---\n".join(results)
    except Exception as e:
        return f"Error executing web search: {str(e)}"

class QuizAgent:
    def __init__(self):
        # We fetch the Gemini API key from environment
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is not set.")
            
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-3.6-flash",
            google_api_key=api_key,
            temperature=0.3
        )
        self.parser = JsonOutputParser(pydantic_object=QuizModel)
        
    def generate_quiz(self, doc_name: str, question_count: int, difficulty: str) -> Dict[str, Any]:
        # Step 1: Agent decides if web search is needed or relies on document retriever
        # We prompt the LLM to act as the agent orchestrator using tools or direct reasoning
        
        # Pull reference material from the document
        text_context = retrieve_study_material(query=doc_name, doc_name=doc_name)
        
        # If it looks like polity or dynamic content, agent might search the web
        web_context = ""
        if "polity" in doc_name.lower() or "amendment" in text_context.lower() or "law" in text_context.lower():
            # Trigger web search tool for any potential updates
            web_context = web_search("latest constitutional amendments government exams polity")
            
        prompt = ChatPromptTemplate.from_template(
            "You are an expert exam creator for competitive government exams.\n"
            "Analyze the study material context and external web search context to create exactly {count} multiple-choice "
            "practice questions at {difficulty} difficulty level.\n\n"
            "STUDY MATERIAL CONTEXT:\n{study_context}\n\n"
            "EXTERNAL WEB CONTEXT:\n{web_context}\n\n"
            "{format_instructions}\n"
            "Please ensure the output matches the required JSON format and correct answers are 0-indexed integers."
        )
        
        chain = prompt | self.llm | self.parser
        
        response = chain.invoke({
            "count": question_count,
            "difficulty": difficulty,
            "study_context": text_context[:12000], # safe window
            "web_context": web_context,
            "format_instructions": self.parser.get_format_instructions()
        })
        
        return response
