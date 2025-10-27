"""FastAPI application entry point"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import players, teams, games, stats, schedule, predictions, chat, gamelogs
from config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.api_title,
    description="API for NBA player, team, and game statistics with advanced analytics",
    version=settings.api_version
)

# CORS middleware - allows frontend to make requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(players.router, prefix="/api/players", tags=["Players"])
app.include_router(teams.router, prefix="/api/teams", tags=["Teams"])
app.include_router(games.router, prefix="/api/games", tags=["Games"])
app.include_router(stats.router, prefix="/api/stats", tags=["Statistics"])
app.include_router(schedule.router, prefix="/api/schedule", tags=["Schedule"])
app.include_router(predictions.router, prefix="/api/predictions", tags=["Predictions"])
app.include_router(gamelogs.router, prefix="/api/gamelogs", tags=["Gamelogs"])
app.include_router(chat.router, prefix="/api", tags=["Chat"])


@app.get("/")
def root():
    return {
        "message": "NBA Analytics API",
        "docs": "/docs",
        "version": "1.0.0"
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}
