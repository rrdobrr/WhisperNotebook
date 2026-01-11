from sqlalchemy import create_engine, Column, Integer, String, Text as TextColumn, Float, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./whispertranscriber.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    default_transcription_method = Column(String, default="local")  # local or api
    default_language = Column(String, default="auto")
    default_model = Column(String, default="gpt-4")
    theme = Column(String, default="light")
    add_timestamps = Column(Boolean, default=True)
    jwt_secret = Column(String, nullable=True)  # Auto-generated JWT secret
    encryption_key = Column(String, nullable=True)  # Auto-generated encryption key for API keys
    summary_prompt = Column(TextColumn, nullable=True)  # Custom prompt for summarization
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Text(Base):
    __tablename__ = "texts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content = Column(TextColumn, nullable=False)

    # Status: queued, processing, unread, read, failed
    status = Column(String, default="unread")

    # Processing timestamps (stored as milliseconds since epoch from client)
    started_at = Column(Integer, nullable=True)  # Client timestamp when processing started
    queued_at = Column(Integer, nullable=True)  # Client timestamp when added to queue

    # Source: upload, youtube, manual
    source_type = Column(String, nullable=False)

    # For uploaded/transcribed files
    filename = Column(String, nullable=True)
    original_filename = Column(String, nullable=True)
    file_type = Column(String, nullable=True)  # audio, video
    file_size = Column(Integer, nullable=True)
    duration = Column(Float, nullable=True)

    # Transcription details
    method = Column(String, nullable=True)  # local or api
    language = Column(String, nullable=True)
    cost = Column(Float, default=0.0)
    error_message = Column(TextColumn, nullable=True)

    extra_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    chat_attachments = relationship("ChatAttachment", back_populates="text", cascade="all, delete-orphan")

class Chat(Base):
    __tablename__ = "chats"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, default="New Chat")
    model = Column(String, default="gpt-4")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    messages = relationship("ChatMessage", back_populates="chat", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("chats.id"), nullable=False)
    role = Column(String, nullable=False)  # user, assistant, system
    content = Column(TextColumn, nullable=False)
    tokens = Column(Integer, nullable=True)
    cost = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    chat = relationship("Chat", back_populates="messages")
    attachments = relationship("ChatAttachment", back_populates="message", cascade="all, delete-orphan")

class ChatAttachment(Base):
    __tablename__ = "chat_attachments"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("chat_messages.id"), nullable=False)
    text_id = Column(Integer, ForeignKey("texts.id"), nullable=False)
    order = Column(Integer, default=0)

    message = relationship("ChatMessage", back_populates="attachments")
    text = relationship("Text", back_populates="chat_attachments")

class Cost(Base):
    __tablename__ = "costs"

    id = Column(Integer, primary_key=True, index=True)
    service = Column(String, nullable=False)  # whisper, chatgpt, railway
    category = Column(String, nullable=True)  # transcription, chat, hosting
    amount = Column(Float, nullable=False)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)

def run_migrations():
    """Run database migrations for schema changes"""
    import sqlite3

    # Only run migrations for SQLite databases
    if "sqlite" not in DATABASE_URL:
        print("Skipping migrations - not a SQLite database")
        return

    # Extract database path from URL
    db_path = DATABASE_URL.replace("sqlite:///", "").replace("sqlite://", "")
    if not db_path.startswith("/"):
        db_path = "./" + db_path

    print(f"Running migrations on: {db_path}")

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Check if columns already exist
        cursor.execute("PRAGMA table_info(texts)")
        columns = [row[1] for row in cursor.fetchall()]

        migrations_applied = []

        # Add started_at column if missing
        if 'started_at' not in columns:
            print("Adding 'started_at' column...")
            cursor.execute("ALTER TABLE texts ADD COLUMN started_at INTEGER")
            migrations_applied.append('started_at')

        # Add queued_at column if missing
        if 'queued_at' not in columns:
            print("Adding 'queued_at' column...")
            cursor.execute("ALTER TABLE texts ADD COLUMN queued_at INTEGER")
            migrations_applied.append('queued_at')

        # Add jwt_secret to settings table if missing
        cursor.execute("PRAGMA table_info(settings)")
        settings_columns = [row[1] for row in cursor.fetchall()]
        if 'jwt_secret' not in settings_columns:
            print("Adding 'jwt_secret' column to settings...")
            cursor.execute("ALTER TABLE settings ADD COLUMN jwt_secret TEXT")
            migrations_applied.append('jwt_secret')

        # Add encryption_key to settings table if missing
        if 'encryption_key' not in settings_columns:
            print("Adding 'encryption_key' column to settings...")
            cursor.execute("ALTER TABLE settings ADD COLUMN encryption_key TEXT")
            migrations_applied.append('encryption_key')

        # Add summary_prompt to settings table if missing
        if 'summary_prompt' not in settings_columns:
            print("Adding 'summary_prompt' column to settings...")
            cursor.execute("ALTER TABLE settings ADD COLUMN summary_prompt TEXT")
            migrations_applied.append('summary_prompt')

        if migrations_applied:
            conn.commit()
            print(f"✅ Applied migrations: {', '.join(migrations_applied)}")
        else:
            print("✅ Database schema is up to date")

        conn.close()
    except Exception as e:
        print(f"❌ Migration error: {e}")
        raise

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
