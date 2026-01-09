from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import Optional

from app.database import get_db, Cost

router = APIRouter()

@router.get("/summary")
async def get_cost_summary(
    days: Optional[int] = 30,
    db: Session = Depends(get_db)
):
    """Get cost summary for specified period"""

    start_date = datetime.utcnow() - timedelta(days=days)

    # Total costs by service
    whisper_cost = db.query(func.sum(Cost.amount)).filter(
        Cost.service == "whisper",
        Cost.created_at >= start_date
    ).scalar() or 0.0

    chatgpt_cost = db.query(func.sum(Cost.amount)).filter(
        Cost.service == "chatgpt",
        Cost.created_at >= start_date
    ).scalar() or 0.0

    railway_cost = db.query(func.sum(Cost.amount)).filter(
        Cost.service == "railway",
        Cost.created_at >= start_date
    ).scalar() or 0.0

    total_cost = whisper_cost + chatgpt_cost + railway_cost

    return {
        "period_days": days,
        "total": total_cost,
        "whisper": whisper_cost,
        "chatgpt": chatgpt_cost,
        "railway": railway_cost,
        "breakdown": {
            "whisper_percentage": (whisper_cost / total_cost * 100) if total_cost > 0 else 0,
            "chatgpt_percentage": (chatgpt_cost / total_cost * 100) if total_cost > 0 else 0,
            "railway_percentage": (railway_cost / total_cost * 100) if total_cost > 0 else 0,
        }
    }

@router.get("/history")
async def get_cost_history(
    skip: int = 0,
    limit: int = 100,
    service: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get cost history"""

    query = db.query(Cost)

    if service:
        query = query.filter(Cost.service == service)

    costs = query.order_by(Cost.created_at.desc()).offset(skip).limit(limit).all()

    return {
        "costs": [
            {
                "id": cost.id,
                "service": cost.service,
                "category": cost.category,
                "amount": cost.amount,
                "details": cost.details,
                "created_at": cost.created_at
            }
            for cost in costs
        ]
    }

@router.get("/daily")
async def get_daily_costs(
    days: int = 30,
    db: Session = Depends(get_db)
):
    """Get daily cost breakdown"""

    start_date = datetime.utcnow() - timedelta(days=days)

    # Query costs grouped by date and service
    costs = db.query(
        func.date(Cost.created_at).label("date"),
        Cost.service,
        func.sum(Cost.amount).label("total")
    ).filter(
        Cost.created_at >= start_date
    ).group_by(
        func.date(Cost.created_at),
        Cost.service
    ).all()

    # Organize by date
    daily_data = {}
    for cost in costs:
        date_str = str(cost.date)
        if date_str not in daily_data:
            daily_data[date_str] = {"date": date_str, "whisper": 0, "chatgpt": 0, "railway": 0, "total": 0}

        daily_data[date_str][cost.service] = float(cost.total)
        daily_data[date_str]["total"] += float(cost.total)

    # Sort by date
    result = sorted(daily_data.values(), key=lambda x: x["date"])

    return {"daily_costs": result}

@router.post("/railway/update")
async def update_railway_cost(
    amount: float,
    details: dict = None,
    db: Session = Depends(get_db)
):
    """Manually add Railway cost"""

    cost = Cost(
        service="railway",
        category="hosting",
        amount=amount,
        details=details
    )
    db.add(cost)
    db.commit()

    return {"message": "Railway cost updated"}
