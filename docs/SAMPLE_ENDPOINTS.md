# NBA Analytics App - Quick Reference

## 🚀 Running the Application

### Backend (FastAPI)
```bash
cd backend
uv run uvicorn api.main:app --reload --port 8000
```
API: http://127.0.0.1:8000
Docs: http://127.0.0.1:8000/docs

### Frontend (React + Vite)
```bash
cd frontend
npm run dev
```
App: http://localhost:5173

---

## 📊 Sample API Endpoints

### Players
**Search**: `GET /api/players/search?q=LeBron`
**Details**: `GET /api/players/1966`
**Stats**: `GET /api/players/1966/stats?season=2023`
**Shot Chart**: `GET /api/players/1966/shot-chart?season=2023`

### Stats
**Leaders**: `GET /api/stats/leaders?stat=avg_points&limit=5`
**Compare**: `GET /api/stats/compare?player_ids=1966,3059318`
**Trends**: `GET /api/stats/trends?stat=avg_points`

---

## ESPN API Reference (Original Data Source)

**Teams**
- [https://sports.core.api.espn.com/v2/sports/{sport_name}/leagues/{league_name}/teams?limit=50](https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/teams?limit=50)

**Seasons**
-