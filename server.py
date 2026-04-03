from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, JSON
from sqlalchemy.orm import sessionmaker, declarative_base, Session, relationship
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
import bcrypt
import os
import json
import shutil
import re
import requests
import docx
from youtube_transcript_api import YouTubeTranscriptApi
import google.generativeai as genai
from dotenv import load_dotenv
import time
import uuid
import jwt # Ensure you installed PyJWT, NOT jwt
from fastapi import FastAPI, HTTPException, Query

# ==========================================
# 0. DYNAMIC DATABASE SETUP (Postgres / SQLite)
# ==========================================
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./local_combined.db")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL)

# ==========================================
# 1. DATABASE CONFIGURATION (Auth DB)
# ==========================================
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True) 
    full_name = Column(String, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    tasks = relationship("Task", back_populates="owner")

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id")) 
    owner = relationship("User", back_populates="tasks")

Base.metadata.create_all(bind=engine)

# ==========================================
# 2. DETAILS DATABASE CONFIGURATION
# ==========================================
DetailsSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
DetailsBase = declarative_base()

def get_details_db():
    db = DetailsSessionLocal()
    try:
        yield db
    finally:
        db.close()

class StudentDetail(DetailsBase):
    __tablename__ = "student_details"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String)
    gender = Column(String)
    date_of_birth = Column(String)
    email = Column(String, unique=True, index=True) 
    mobile_number = Column(String)
    parent_mobile_number = Column(String, nullable=True)
    city = Column(String)
    state = Column(String)
    class_standard = Column(String)
    board = Column(String, nullable=True)
    stream = Column(String, nullable=True)
    course = Column(String, nullable=True) 
    subjects = Column(JSON, nullable=True) 
    exam_preparation_for = Column(JSON, nullable=True)
    preferred_language = Column(String)
    weak_subjects = Column(JSON, nullable=True)
    strong_subjects = Column(JSON, nullable=True)

class UserSchedule(DetailsBase):
    __tablename__ = "user_schedules"
    user_id = Column(Integer, primary_key=True, index=True)
    schedule_json = Column(String, default="{}")

class UserExam(DetailsBase):
    __tablename__ = "user_exams"
    user_id = Column(Integer, primary_key=True, index=True)
    exams_json = Column(String, default="[]")

DetailsBase.metadata.create_all(bind=engine)

# ==========================================
# 3. PYDANTIC SCHEMAS 
# ==========================================
class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)

class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)

class PersonalDetails(BaseModel):
    full_name: str
    gender: str
    date_of_birth: str
    email: str
    mobile_number: str
    parent_mobile_number: Optional[str] = None
    city: str
    state: str

class AcademicDetails(BaseModel):
    class_standard: str
    board: Optional[str] = None
    stream: Optional[str] = None
    course: Optional[str] = None 
    subjects: List[str] = []

class LearningPreferences(BaseModel):
    exam_preparation_for: List[str] = []
    preferred_language: str
    weak_subjects: List[str] = []
    strong_subjects: List[str] = []

class StudentDetailsPayload(BaseModel):
    personal_details: PersonalDetails
    academic_details: AcademicDetails
    learning_preferences: LearningPreferences

class ScheduleUpdate(BaseModel):
    user_id: int
    schedule: dict

class ExamItem(BaseModel):
    subject: str
    date: str
    time: str

class ExamUpdate(BaseModel):
    user_id: int
    exams: List[ExamItem]

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []

class YouTubeRequest(BaseModel):
    url: str

class YouTubeChatRequest(BaseModel):
    video_id: str
    message: str
    history: List[ChatMessage] = []

class PDFChatRequest(BaseModel):
    message: str
    pdf_name: str 
    history: List[ChatMessage] = []

class ScheduleGenRequest(BaseModel):
    prompt: str

class ChartRequest(BaseModel):
    prompt: str
    category: str 

# ==========================================
# 4. APP & AI SETUP
# ==========================================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://edunovaq.site", 
        "https://www.edunovaq.site", 
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode('utf-8')
    hashed_password_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hashed_password_bytes)

def get_password_hash(password: str) -> str:
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(password_bytes, salt)
    return hashed_password.decode('utf-8')

load_dotenv()
gemini_api_key = os.getenv("Gemini_API_Key")
if gemini_api_key:
    genai.configure(api_key=gemini_api_key)
    model = genai.GenerativeModel('gemini-2.5-flash')
else:
    print("WARNING: Gemini_API_Key not found in environment variables")

YT_CONTEXT_MEMORY = {}
JAAS_APP_ID = "vpaas-magic-cookie-0173a0b920f94c92ba407b9fd59fc259"
JAAS_API_KEY_ID = "vpaas-magic-cookie-0173a0b920f94c92ba407b9fd59fc259/8847b3" 
PRIVATE_KEY_PATH = "Key 3_26_2026, 2_43_10 PM.pk" 

def generate_jaas_token(user_name: str, user_email: str = "student@edunovaq.com", is_moderator: bool = False) -> str:
    try:
        with open(PRIVATE_KEY_PATH, 'r') as key_file:
            private_key = key_file.read()
    except FileNotFoundError:
        raise Exception("Private key file not found. Ensure jaas_private_key.pem is in the correct directory.")

    now = int(time.time())
    exp = now + 7200

    payload = {
        "aud": "jitsi",
        "iss": "chat",
        "iat": now,
        "exp": exp,
        "nbf": now,
        "sub": JAAS_APP_ID,
        "room": "*", 
        "context": {
            "features": {
                "livestreaming": False,
                "recording": False,
                "outbound-call": False,
                "sip-outbound-call": False,
                "transcription": False
            },
            "user": {
                "hidden": False,
                "name": user_name,
                "email": user_email,
                "id": str(uuid.uuid4()),
                "moderator": is_moderator
            }
        }
    }

    headers = {
        "kid": JAAS_API_KEY_ID,
        "typ": "JWT",
        "alg": "RS256"
    }

    token = jwt.encode(payload, private_key, algorithm="RS256", headers=headers)
    return token

@app.get("/api/get-meet-token")
async def get_meet_token(username: str = Query("Edunovaq Student", description="The name of the user joining the meet")):
    try:
        token = generate_jaas_token(user_name=username)
        return {"success": True, "token": token}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 5. AUTH & DASHBOARD ENDPOINTS
# ==========================================
@app.post("/api/signup")
def signup(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pwd = get_password_hash(user.password)
    new_user = User(email=user.email, hashed_password=hashed_pwd, full_name=user.username)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "Signup successful", "user": {"id": new_user.id, "email": new_user.email, "full_name": new_user.full_name}}

@app.post("/api/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Wrong username or password")
    return {"message": "Login successful", "user": {"id": db_user.id, "email": db_user.email, "full_name": db_user.full_name}}

@app.post("/api/save-details")
def save_student_details(payload: StudentDetailsPayload, db: Session = Depends(get_details_db)):
    existing_record = db.query(StudentDetail).filter(StudentDetail.email == payload.personal_details.email).first()
    if existing_record:
        raise HTTPException(status_code=400, detail="Details for this email already exist.")
        
    new_detail = StudentDetail(
        full_name = payload.personal_details.full_name, gender = payload.personal_details.gender,
        date_of_birth = payload.personal_details.date_of_birth, email = payload.personal_details.email,
        mobile_number = payload.personal_details.mobile_number, parent_mobile_number = payload.personal_details.parent_mobile_number,
        city = payload.personal_details.city, state = payload.personal_details.state,
        class_standard = payload.academic_details.class_standard, board = payload.academic_details.board,
        stream = payload.academic_details.stream, course = payload.academic_details.course, 
        subjects = payload.academic_details.subjects, exam_preparation_for = payload.learning_preferences.exam_preparation_for,
        preferred_language = payload.learning_preferences.preferred_language, weak_subjects = payload.learning_preferences.weak_subjects,
        strong_subjects = payload.learning_preferences.strong_subjects
    )
    db.add(new_detail)
    db.commit()
    return {"message": "Student details saved successfully"}

@app.put("/api/update-student-details/{user_id}")
def update_student_details(user_id: int, payload: StudentDetailsPayload, db: Session = Depends(get_details_db)):
    db_detail = db.query(StudentDetail).filter(StudentDetail.id == user_id).first()
    if not db_detail: raise HTTPException(status_code=404, detail="Student record not found")

    try:
        db_detail.full_name = payload.personal_details.full_name
        db_detail.mobile_number = payload.personal_details.mobile_number
        db_detail.city = payload.personal_details.city
        db_detail.state = payload.personal_details.state
        db_detail.date_of_birth = payload.personal_details.date_of_birth
        db_detail.gender = payload.personal_details.gender
        db_detail.class_standard = payload.academic_details.class_standard
        db_detail.board = payload.academic_details.board
        db_detail.stream = payload.academic_details.stream
        db_detail.preferred_language = payload.learning_preferences.preferred_language
        db_detail.exam_preparation_for = payload.learning_preferences.exam_preparation_for
        db.commit()
        return {"status": "success", "message": "Settings updated successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database update failed: {str(e)}")

@app.get("/api/dashboard-stats/{user_id}")
def get_dashboard_stats(user_id: int, auth_db: Session = Depends(get_db), details_db: Session = Depends(get_details_db)):
    user = auth_db.query(User).filter(User.id == user_id).first()
    if not user: raise HTTPException(status_code=404, detail="User not found")

    student = details_db.query(StudentDetail).filter(StudentDetail.email == user.email).first()
    schedule_record = details_db.query(UserSchedule).filter(UserSchedule.user_id == user_id).first()
    exam_record = details_db.query(UserExam).filter(UserExam.user_id == user_id).first()
    
    upcoming_exams = json.loads(exam_record.exams_json) if exam_record and exam_record.exams_json else []

    today = datetime.now().date()
    pending_count = 0
    completed_count = 0
    activity_by_month = {m: 0 for m in range(1, 13)}

    if schedule_record and schedule_record.schedule_json:
        schedule_data = json.loads(schedule_record.schedule_json)
        for date_str, tasks in schedule_data.items():
            try:
                task_date = datetime.strptime(date_str, "%Y-%m-%d").date()
                activity_by_month[task_date.month] += (len(tasks) * 20) 
                if task_date >= today: pending_count += len(tasks)
                else: completed_count += len(tasks)
            except ValueError: continue

    total_tasks = pending_count + completed_count
    progress_percent = int((completed_count / total_tasks) * 100) if total_tasks > 0 else 0

    current_month = today.month
    months_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    att_data = []
    att_labels = []
    
    for i in range(5, -1, -1):
        m = current_month - i
        if m <= 0: m += 12
        val = activity_by_month[m] if activity_by_month[m] <= 100 else 100
        att_data.append(val)
        att_labels.append(months_names[m-1])

    if sum(att_data) == 0: att_data = [5, 15, 10, 25, 20, 30]

    exam_prep = "your exams"
    if student and student.exam_preparation_for and len(student.exam_preparation_for) > 0:
        exam_prep = student.exam_preparation_for[0] 

   # --- ROBUST STANDARD & STREAM CHECKER ---
    raw_std = str(student.class_standard).lower() if student and student.class_standard else "10"
    raw_stream = str(student.stream).lower() if student and student.stream else ""
    
    # Combine both fields to catch "12th commerce" typed in the standard field
    combined_info = raw_std + " " + raw_stream

    if "12" in raw_std:
        clean_std = "12"
    elif "10" in raw_std:
        clean_std = "10"
    else:
        # THE FIX: Stop forcing unknown standards to "10". 
        # Pass the actual standard (e.g., "bsc", "11") to the frontend.
        clean_std = raw_std
        
    # Check combined string for stream keywords
    if "commerce" in combined_info:
        clean_stream = "Commerce"
    elif "arts" in combined_info:
        clean_stream = "Arts"
    else:
        clean_stream = "Science"
            
    return {
        "class_standard": clean_std, 
        "stream": clean_stream,
        "hero_subtitle": f"Keep focusing on {exam_prep}! You have {pending_count} pending tasks to review.",
        "stats": { "progress": progress_percent, "pending": pending_count, "time_spent": "4.5", "streak": 3 },
        "charts": { "performance": [progress_percent, 100 - progress_percent], "attendance": att_data, "attendance_labels": att_labels },
        "upcoming_exams": upcoming_exams 
    }

# ==========================================
# 6. SCHEDULE & EXAMS ENDPOINTS
# ==========================================
@app.post("/api/update-schedule")
def update_user_schedule(data: ScheduleUpdate, db: Session = Depends(get_details_db)):
    schedule_string = json.dumps(data.schedule)
    record = db.query(UserSchedule).filter(UserSchedule.user_id == data.user_id).first()
    if record: record.schedule_json = schedule_string 
    else: db.add(UserSchedule(user_id=data.user_id, schedule_json=schedule_string))
    db.commit()
    return {"status": "success", "message": "Schedule saved successfully!"}

@app.get("/api/get-schedule/{user_id}")
def get_user_schedule(user_id: int, db: Session = Depends(get_details_db)):
    record = db.query(UserSchedule).filter(UserSchedule.user_id == user_id).first()
    if record and record.schedule_json: return {"status": "success", "schedule": json.loads(record.schedule_json)}
    return {"status": "success", "schedule": {}}

@app.post("/api/update-exams")
def update_user_exams(data: ExamUpdate, db: Session = Depends(get_details_db)):
    exams_list = [{"subject": e.subject, "date": e.date, "time": e.time} for e in data.exams]
    exams_string = json.dumps(exams_list)
    record = db.query(UserExam).filter(UserExam.user_id == data.user_id).first()
    if record: record.exams_json = exams_string
    else: db.add(UserExam(user_id=data.user_id, exams_json=exams_string))
    db.commit()
    return {"status": "success", "message": "Exams saved successfully!"}

# ==========================================
# 7. AI CHAT & MEDIA ENDPOINTS
# ==========================================
@app.post("/api/chat")
def chat_with_ai(request: ChatRequest):
    try:
        formatted_history = [{"role": msg.role, "parts": [msg.content]} for msg in request.history]
        chat = model.start_chat(history=formatted_history)
        response = chat.send_message(request.message)
        return {"status": "success", "reply": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/youtube-summarize")
def summarize_youtube_video(request: YouTubeRequest):
    try:
        match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11}).*", request.url)
        if match: video_id = match.group(1)
        else: raise HTTPException(status_code=400, detail="Invalid YouTube URL.")

        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        try:
            yt_meta = requests.get(oembed_url).json()
            title = yt_meta.get("title", "Unknown Title")
            author = yt_meta.get("author_name", "Unknown Author")
        except:
            title, author = "Unknown Title", "Unknown Channel"

        try:
            if not os.path.exists('cookies.txt'): raise Exception("cookies.txt file not found in root directory.")
            ytt_api = YouTubeTranscriptApi(cookies='cookies.txt')
            fetched_data = ytt_api.fetch(video_id)
            transcript_list = fetched_data.to_raw_data()
            transcript_text = " ".join([entry['text'] for entry in transcript_list])
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Transcript error: {str(e)}")
        
        full_context = f"Video Title: {title}\nChannel: {author}\nTranscript: {transcript_text}"
        YT_CONTEXT_MEMORY[video_id] = full_context

        prompt = f"""You are an expert tutor. I am providing you with the transcript of a YouTube video titled "{title}" by "{author}". 
        Please provide: 1. A brief 2-sentence overview. 2. A bulleted list of the Core Concepts & Key Takeaways. 
        Use Markdown formatting. Transcript: {transcript_text[:60000]}"""
        
        response = model.generate_content(prompt)
        return {"status": "success", "summary": response.text, "video_id": video_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not process video: {str(e)}")

@app.post("/api/youtube-chat")
def chat_with_youtube_video(request: YouTubeChatRequest):
    try:
        video_context = YT_CONTEXT_MEMORY.get(request.video_id, "")
        if not video_context: raise HTTPException(status_code=400, detail="Video context expired.")
        rebuilt_history = []
        if len(request.history) > 0:
            for i, msg in enumerate(request.history):
                if i == 0 and msg.role == 'user':
                    hidden_prompt = f"Context for this conversation based on a YouTube video:\n{video_context[:60000]}\n\nUser Question: {msg.content}"
                    rebuilt_history.append({"role": "user", "parts": [hidden_prompt]})
                else: rebuilt_history.append({"role": msg.role, "parts": [msg.content]})
            chat = model.start_chat(history=rebuilt_history)
            response = chat.send_message(request.message)
        else:
            prompt = f"Context for this conversation based on a YouTube video:\n{video_context[:60000]}\n\nUser Question: {request.message}"
            response = model.generate_content(prompt)
        return {"status": "success", "reply": response.text}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    try:
        temp_path = f"temp_{file.filename}"
        with open(temp_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
        file_ext = file.filename.lower()
        upload_path = temp_path
        mime_type = "application/pdf" 
        
        if file_ext.endswith(".docx"):
            doc = docx.Document(temp_path)
            full_text = [para.text for para in doc.paragraphs]
            upload_path = f"temp_converted_{file.filename}.txt"
            with open(upload_path, "w", encoding="utf-8") as f: f.write("\n".join(full_text))
            mime_type = "text/plain"
        elif file_ext.endswith(".txt"): mime_type = "text/plain"
        
        gemini_file = genai.upload_file(upload_path, mime_type=mime_type)
        if os.path.exists(temp_path): os.remove(temp_path)
        if upload_path != temp_path and os.path.exists(upload_path): os.remove(upload_path)
        return {"status": "success", "pdf_name": gemini_file.name, "display_name": file.filename}
    except Exception as e: 
        if os.path.exists(f"temp_{file.filename}"): os.remove(f"temp_{file.filename}")
        if os.path.exists(f"temp_converted_{file.filename}.txt"): os.remove(f"temp_converted_{file.filename}.txt")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat-pdf")
def chat_with_pdf(request: PDFChatRequest):
    try:
        uploaded_file = genai.get_file(request.pdf_name)
        rebuilt_history = []
        if len(request.history) > 0:
            for i, msg in enumerate(request.history):
                if i == 0 and msg.role == 'user': rebuilt_history.append({"role": "user", "parts": [uploaded_file, msg.content]})
                else: rebuilt_history.append({"role": msg.role, "parts": [msg.content]})
            chat = model.start_chat(history=rebuilt_history)
            response = chat.send_message(request.message)
        else: response = model.generate_content([uploaded_file, request.message])
        return {"status": "success", "reply": response.text}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-chart")
def generate_mermaid_chart(request: ChartRequest):
    try:
        syntax_guide = {
            "flowchart": "Use 'graph TD' or 'graph LR'.",
            "pie chart": "Use 'pie title [Title]' syntax.",
            "mindmap": "Use 'mindmap' syntax.",
            "roadmap": "Use 'timeline' syntax for a strategic roadmap.",
            "timeline": "Use 'timeline' syntax. Format: section [Title] : [Event] : [Event].",
            "sequence": "Use 'sequenceDiagram' syntax with 'participant' and arrows like 'A->>B: Message'.",
            "graph": "Use 'graph TD' or 'xychart-beta' for data graphs."
        }

        prompt = f"""You are a Mermaid.js code generator. Create code for a {request.category} based on this request: "{request.prompt}"
        Strict Rules: 1. Category: {request.category} 2. Syntax specific: {syntax_guide.get(request.category)} 3. No explanations. Return ONLY the code."""
        response = model.generate_content(prompt)
        clean_code = response.text.replace("```mermaid", "").replace("```", "").strip()
        return {"status": "success", "mermaid_code": clean_code}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/api/generate-schedule")
def generate_schedule(request: ScheduleGenRequest):
    try:
        prompt = f"""You are an expert time management and productivity assistant. Create a practical, well-structured daily schedule based on this user input: "{request.prompt}"
        Return ONLY a raw JSON array of objects. Do not include markdown formatting.
        Each object must have exactly these three keys: - "time" - "task" - "description" """
        response = model.generate_content(prompt)
        clean_json = response.text.replace("```json", "").replace("```", "").strip()
        try: schedule_data = json.loads(clean_json)
        except json.JSONDecodeError: schedule_data = [{"time": "Error", "task": "Formatting Issue", "description": clean_json}]
        return {"status": "success", "schedule": schedule_data}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))
    
# ==========================================
# 8. GAMIFICATION & QUIZ ENDPOINTS
# ==========================================

@app.get("/api/gamification-data/{user_id}/{subject}/{type}")
def get_gamification_data(user_id: int, subject: str, type: str, 
                          auth_db: Session = Depends(get_db), 
                          details_db: Session = Depends(get_details_db)):
    """
    type: 'quiz' or 'flashcard'
    This endpoint fetches data based on the user's standard in the DB.
    """
    user = auth_db.query(User).filter(User.id == user_id).first()
    if not user: raise HTTPException(status_code=404, detail="User not found")

    student = details_db.query(StudentDetail).filter(StudentDetail.email == user.email).first()
    if not student: raise HTTPException(status_code=404, detail="Student profile incomplete")

    # --- ROBUST STANDARD & STREAM CHECKER ---
    raw_std = str(student.class_standard).lower() if student.class_standard else "10"
    raw_stream = str(student.stream).lower() if student.stream else ""
    
    # Combine both fields
    combined_info = raw_std + " " + raw_stream

    if "12" in raw_std:
        if "commerce" in combined_info:
            standard_key = "Std_12_Commerce"
        elif "arts" in combined_info:
            standard_key = "Std_12_Arts"
        else:
            standard_key = "Std_12_Science"
    elif "10" in raw_std:
        standard_key = "Std_10"
    else:
        standard_key = "Std_10" 

    file_to_open = "quiz_data.json" if type == "quiz" else "flashcard_data.json"

    if not os.path.exists(file_to_open):
        raise HTTPException(status_code=500, detail=f"{file_to_open} missing on production server")

    # THE FIX: Explicitly open with utf-8 so Hindi and Math symbols don't crash the server
    with open(file_to_open, "r", encoding="utf-8") as f:
        full_data = json.load(f)
    
    content = full_data.get(standard_key, {}).get(subject, [])
    if not content:
        raise HTTPException(status_code=404, detail=f"No questions found for {subject} in {standard_key}")
    
    return {
        "status": "success",
        "standard": standard_key.replace("Std_", ""),
        "subject": subject,
        "data": content
    }

# ==========================================
# 9. HTML PAGE ROUTING
# ==========================================
@app.get("/loginpage")
def get_login_page(): return FileResponse("login.html")
@app.get("/signuppage")
def get_signup_page(): return FileResponse("signup.html")
@app.get("/detailspage")
def get_details_page():
    if not os.path.exists("details.html"): raise HTTPException(status_code=404, detail="details.html not found")
    return FileResponse("details.html")

@app.get("/quizdashboardpage")
def get_quiz_dashboard(): return FileResponse("quiz-dashboard.html")

@app.get("/quizflowpage")
def get_quiz_flow(): return FileResponse("quiz-flow.html")

@app.get("/flashcardpage")
def get_flashcard_page(): return FileResponse("flashcards.html")

app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)