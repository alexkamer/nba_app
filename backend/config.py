"""Application configuration"""
from typing import List
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Database
    database_url: str = "sqlite:///../data/nba.db"

    # CORS
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # API
    api_title: str = "NBA Analytics API"
    api_version: str = "1.0.0"

    # Server
    host: str = "127.0.0.1"
    port: int = 8000

    # Azure OpenAI
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment_id: str = ""
    azure_openai_api_version: str = "2024-12-01-preview"

    class Config:
        env_file = ".env"
        case_sensitive = False

    @property
    def cors_origins_list(self) -> List[str]:
        """Convert comma-separated CORS origins to list"""
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
