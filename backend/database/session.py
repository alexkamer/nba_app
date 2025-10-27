"""Database session management"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from functools import lru_cache

# Database URL - absolute path to nba.db in data directory
import os
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "nba.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

# Create engine
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # Needed for SQLite
    echo=False  # Set to True for SQL debugging
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Session:
    """Dependency for getting DB session in FastAPI routes"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
