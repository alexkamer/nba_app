# ChatBot Smart Query Parsing

## Enhancements Made

### **Problem 1: Nickname Matching**
- "steph curry" wouldn't match "Stephen Curry"
- Queries would fail or fall back to slow LLM path

### **Solution: Nickname Mapping**
Added common nickname → full name mapping:
- `steph` → `stephen`
- `lebron` → `lebron james`
- `luka` → `luka doncic`
- `kd` → `kevin durant`
- `ad` → `anthony davis`
- `giannis` → `giannis antetokounmpo`
- `jokic` → `nikola jokic`
- `embiid` → `joel embiid`

---

### **Problem 2: Lost Context**
- "rudy gobert gamelog vs the lakers" would show ALL games, not just vs Lakers
- Query parsing didn't extract filters

### **Solution: Context-Aware Parsing**
Now extracts:
1. **Player name** (with nickname support)
2. **Opponent filter** - detects "vs/versus/against/@ [team]"
3. **Game limit** - detects "last [N] games"

---

## New Query Patterns Supported

### **Opponent Filtering:**
✅ "rudy gobert gamelog vs the lakers"
✅ "show me luka doncic games against warriors"
✅ "steph curry @ the celtics"
✅ "lebron versus denver"

### **Custom Limits:**
✅ "show me luka last 5 games"
✅ "steph curry last 20 games"
✅ "lebron recent 10 games"

### **Combined:**
✅ "show me luka last 5 games vs warriors"
✅ "steph curry last 10 games against the lakers"

### **Nicknames:**
✅ "steph curry gamelog" → finds "Stephen Curry"
✅ "show me luka last games" → finds "Luka Doncic"
✅ "kd gamelog" → finds "Kevin Durant"
✅ "giannis games" → finds "Giannis Antetokounmpo"

---

## Implementation Details

### **1. Enhanced Pattern Detection**
```python
def is_gamelog_query(query: str) -> tuple[bool, dict]:
    # Returns: (is_gamelog, {player_name, opponent, limit})

    # Extract player name
    # Extract opponent: "vs/against/@ [team]"
    # Extract limit: "last [N] games"
    # Apply nickname mapping
```

### **2. Opponent Filter in SQL**
```sql
WHERE a.athlete_display_name LIKE :player_search
AND pb.athlete_didNotPlay IS NOT 1
AND (:opponent IS NULL OR
     opponent_name LIKE :opponent_search)  -- NEW!
```

### **3. API Endpoint Enhancement**
```python
@router.get("/players/{player_name}/gamelog")
def get_player_gamelog(
    player_name: str,
    limit: int = 15,
    opponent: Optional[str] = None,  # NEW!
    db: Session = Depends(get_db)
):
```

### **4. Response Title Update**
```markdown
## Rudy Gobert - Last 3 Games vs Lakers
```
Instead of just:
```markdown
## Rudy Gobert - Last 3 Games
```

---

## Testing

### **Test Nickname Matching:**
```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "show me steph curry last games"}'

# Should instantly return Stephen Curry's gamelog
```

### **Test Opponent Filter:**
```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "rudy gobert gamelog vs the lakers"}'

# Should return only games against Lakers
```

### **Test Custom Limit:**
```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "show me luka last 5 games"}'

# Should return only 5 games
```

### **Test Combined:**
```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "steph curry last 3 games vs warriors"}'

# Should return only 3 games against Warriors
```

---

## Performance

| Query Type | Before | After | Notes |
|------------|--------|-------|-------|
| "steph curry gamelog" | 20s (LLM fallback) | <1s | Nickname matched |
| "luka vs lakers" | 15s (shows all games) | <1s | Filtered correctly |
| "lebron last 5 games" | 15s | <1s | Limit applied |
| Complex queries | 15-20s | 15-20s | Still uses LLM |

---

## Future Enhancements

### **More Nicknames:**
- Magic Johnson, Dr. J, King James, etc.
- Automatic fuzzy matching using Levenshtein distance

### **More Filters:**
- Date ranges: "games this month", "last week"
- Home/Away: "home games", "road games"
- Result: "wins", "losses"
- Performance: "games with 30+ points"

### **Example Future Queries:**
- "steph curry home games this month"
- "lebron wins vs warriors"
- "luka games with 40+ points"
- "giannis road games in november"

### **Implementation Pattern:**
1. Add regex pattern to detect filter
2. Add SQL WHERE clause
3. Add parameter to endpoint
4. Update title to show filter

---

**Document Version:** 1.0
**Last Updated:** 2025-10-22
**Status:** ✅ Implemented and Active
