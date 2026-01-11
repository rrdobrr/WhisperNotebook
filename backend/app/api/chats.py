from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db, Chat, ChatMessage, ChatAttachment, Text
from app.models.schemas import ChatResponse, ChatCreate, ChatUpdate, MessageCreate, MessageResponse
from app.services.llm_service import LLMService

router = APIRouter()

@router.post("/", response_model=ChatResponse)
async def create_chat(chat_data: ChatCreate, db: Session = Depends(get_db)):
    """Create new chat"""
    chat = Chat(
        title=chat_data.title or "New Chat",
        model=chat_data.model or "gpt-4"
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat

@router.get("/", response_model=List[ChatResponse])
async def get_chats(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all chats"""
    chats = db.query(Chat).order_by(Chat.updated_at.desc()).offset(skip).limit(limit).all()
    return chats

@router.get("/{chat_id}", response_model=ChatResponse)
async def get_chat(chat_id: int, db: Session = Depends(get_db)):
    """Get chat by ID with messages"""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat

@router.put("/{chat_id}", response_model=ChatResponse)
async def update_chat(chat_id: int, chat_data: ChatUpdate, db: Session = Depends(get_db)):
    """Update chat"""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    if chat_data.title is not None:
        chat.title = chat_data.title
    if chat_data.model is not None:
        chat.model = chat_data.model

    db.commit()
    db.refresh(chat)
    return chat

@router.delete("/{chat_id}")
async def delete_chat(chat_id: int, db: Session = Depends(get_db)):
    """Delete chat"""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    db.delete(chat)
    db.commit()

    return {"message": "Chat deleted successfully"}

@router.post("/{chat_id}/messages", response_model=MessageResponse)
async def send_message(
    chat_id: int,
    message_data: MessageCreate,
    db: Session = Depends(get_db)
):
    """Send message to chat (non-streaming)"""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Create user message
    user_message = ChatMessage(
        chat_id=chat_id,
        role="user",
        content=message_data.content
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    # Handle text attachments
    llm_content = message_data.content  # Content to send to LLM
    if message_data.text_ids:
        llm_content += "\n\n"
        for idx, text_id in enumerate(message_data.text_ids):
            text = db.query(Text).filter(Text.id == text_id).first()
            if text:
                attachment = ChatAttachment(
                    message_id=user_message.id,
                    text_id=text_id,
                    order=idx
                )
                db.add(attachment)
                llm_content += f"\n\n--- Текстовое вложение {idx + 1} ---\n{text.content}\n"
        db.commit()

    # Get chat history
    messages = db.query(ChatMessage).filter(ChatMessage.chat_id == chat_id).order_by(ChatMessage.created_at).all()

    # Build messages for LLM with concatenated attachments for the last user message
    llm_messages = []
    for msg in messages:
        if msg.id == user_message.id:
            # Use the content with concatenated attachments for the current message
            llm_messages.append({"role": msg.role, "content": llm_content})
        else:
            # For previous messages, reconstruct with attachments if they exist
            content = msg.content
            if msg.attachments:
                for idx, att in enumerate(msg.attachments):
                    content += f"\n\n--- Текстовое вложение {idx + 1} ---\n{att.text.content}\n"
            llm_messages.append({"role": msg.role, "content": content})

    # Generate response
    try:
        response_text, tokens, cost = LLMService.chat_completion(
            messages=llm_messages,
            model=chat.model
        )

        # Create assistant message
        assistant_message = ChatMessage(
            chat_id=chat_id,
            role="assistant",
            content=response_text,
            tokens=tokens,
            cost=cost
        )
        db.add(assistant_message)
        db.commit()
        db.refresh(assistant_message)

        # Record cost
        from app.database import Cost
        cost_record = Cost(
            service="chatgpt",
            category="chat",
            amount=cost,
            details={"chat_id": chat_id, "model": chat.model, "tokens": tokens}
        )
        db.add(cost_record)
        db.commit()

        return assistant_message
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{chat_id}/messages/stream")
async def send_message_stream(
    chat_id: int,
    message_data: MessageCreate,
    db: Session = Depends(get_db)
):
    """Send message to chat with streaming response"""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Extract model before session might close
    model = chat.model

    # Create user message
    user_message = ChatMessage(
        chat_id=chat_id,
        role="user",
        content=message_data.content
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    # Handle text attachments
    llm_content = message_data.content
    if message_data.text_ids:
        llm_content += "\n\n"
        for idx, text_id in enumerate(message_data.text_ids):
            text = db.query(Text).filter(Text.id == text_id).first()
            if text:
                attachment = ChatAttachment(
                    message_id=user_message.id,
                    text_id=text_id,
                    order=idx
                )
                db.add(attachment)
                llm_content += f"\n\n--- Текстовое вложение {idx + 1} ---\n{text.content}\n"
        db.commit()

    # Get chat history and build messages for LLM
    messages = db.query(ChatMessage).filter(ChatMessage.chat_id == chat_id).order_by(ChatMessage.created_at).all()

    llm_messages = []
    for msg in messages:
        if msg.id == user_message.id:
            # Use content with concatenated attachments for current message
            llm_messages.append({"role": msg.role, "content": llm_content})
        else:
            # For previous messages, reconstruct with attachments
            content = msg.content
            if msg.attachments:
                for idx, att in enumerate(msg.attachments):
                    content += f"\n\n--- Текстовое вложение {idx + 1} ---\n{att.text.content}\n"
            llm_messages.append({"role": msg.role, "content": content})

    def generate():
        from app.database import get_db
        try:
            full_response = ""
            for chunk in LLMService.chat_completion_stream(
                messages=llm_messages,
                model=model
            ):
                full_response += chunk
                yield f"data: {chunk}\n\n"

            # Create new session for saving the result
            db_gen = next(get_db())
            try:
                assistant_message = ChatMessage(
                    chat_id=chat_id,
                    role="assistant",
                    content=full_response
                )
                db_gen.add(assistant_message)
                db_gen.commit()
            finally:
                db_gen.close()

            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

@router.get("/{chat_id}/messages", response_model=List[MessageResponse])
async def get_messages(chat_id: int, db: Session = Depends(get_db)):
    """Get all messages in chat"""
    from app.models.schemas import AttachmentInfo

    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    messages = db.query(ChatMessage).filter(ChatMessage.chat_id == chat_id).order_by(ChatMessage.created_at).all()

    # Convert to response format with attachments
    result = []
    for msg in messages:
        attachments = [
            AttachmentInfo(text_id=att.text_id, title=att.text.title)
            for att in msg.attachments
        ]
        result.append(MessageResponse(
            id=msg.id,
            chat_id=msg.chat_id,
            role=msg.role,
            content=msg.content,
            tokens=msg.tokens,
            cost=msg.cost,
            created_at=msg.created_at,
            attachments=attachments
        ))

    return result
