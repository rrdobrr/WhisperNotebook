from sqlalchemy import create_engine, Column, Integer, String, Text, Float, DateTime, Boolean, ForeignKey, JSON
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
    openai_api_key = Column(String, nullable=True)
    default_transcription_method = Column(String, default="local")  # local or api
    default_language = Column(String, default="auto")
    default_model = Column(String, default="gpt-4")
    theme = Column(String, default="light")
    add_timestamps = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Text(Base):
    __tablename__ = "texts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)

    # Status: processing, unread, read
    status = Column(String, default="unread")

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
    error_message = Column(Text, nullable=True)

    metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    chat_attachments = relationship("ChatAttachment", back_populates="text")

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
    content = Column(Text, nullable=False)
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

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
