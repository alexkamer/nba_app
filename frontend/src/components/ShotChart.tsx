import { useState } from 'react';

interface Shot {
  play_id: string;
  text: string;
  x: number;
  y: number;
  made: boolean;
  shot_type: string;
  score_value: number;
  quarter: number;
  quarter_display: string;
  clock: string;
  team_id: string;
  athlete_id: string;
  athlete_name: string;
  athlete_headshot?: string;
  away_score: number;
  home_score: number;
}

interface ShotChartProps {
  shots: Shot[];
  awayTeamId: string;
  homeTeamId: string;
  awayTeamName: string;
  homeTeamName: string;
  awayTeamColor?: string;
  homeTeamColor?: string;
}

export default function ShotChart({
  shots,
  awayTeamId,
  homeTeamId,
  awayTeamName,
  homeTeamName,
  awayTeamColor = 'f97316',
  homeTeamColor = '3b82f6'
}: ShotChartProps) {
  const [hoveredShot, setHoveredShot] = useState<Shot | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<'all' | 'away' | 'home'>('all');
  const [selectedQuarter, setSelectedQuarter] = useState<string>('all');
  const [selectedPlayer, setSelectedPlayer] = useState<string>('all');
  const [shotFilter, setShotFilter] = useState<'all' | 'made' | 'missed'>('all');

  // Filter shots based on selections
  const filteredShots = shots.filter(shot => {
    if (selectedTeam === 'away' && shot.team_id !== awayTeamId) return false;
    if (selectedTeam === 'home' && shot.team_id !== homeTeamId) return false;
    if (selectedQuarter !== 'all' && shot.quarter.toString() !== selectedQuarter) return false;
    if (selectedPlayer !== 'all' && shot.athlete_id !== selectedPlayer) return false;
    if (shotFilter === 'made' && !shot.made) return false;
    if (shotFilter === 'missed' && shot.made) return false;
    return true;
  });

  // Get unique players for filter
  const players = Array.from(new Set(shots.map(s => ({ id: s.athlete_id, name: s.athlete_name }))))
    .filter((p, i, arr) => arr.findIndex(p2 => p2.id === p.id) === i)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Calculate statistics
  const madeShots = filteredShots.filter(s => s.made).length;
  const missedShots = filteredShots.filter(s => !s.made).length;
  const totalShots = filteredShots.length;
  const fgPercentage = totalShots > 0 ? ((madeShots / totalShots) * 100).toFixed(1) : '0.0';

  // SVG dimensions - full court (horizontal)
  const courtWidth = 940; // Full court length (94 feet scaled = 10 per foot)
  const courtHeight = 500; // Court width (50 feet scaled = 10 per foot)

  // Scale coordinates from ESPN to SVG
  // CRITICAL: ESPN's Y coordinate represents distance from the basket being shot AT (0-30 feet)
  // NOT absolute court position. Both teams' shots are measured from their offensive basket.
  //
  // ESPN coordinates:
  //   x = court width (0-50 feet)
  //   y = distance from offensive basket (0-30 feet)
  //
  // For horizontal full court SVG:
  //   - Away team shoots at LEFT basket: svgX = y * 10
  //   - Home team shoots at RIGHT basket: svgX = 940 - (y * 10)
  //   - Both teams: svgY = x * 10 (vertical position)

  const scaleToSvgY = (x: number) => x * 10; // ESPN X (0-50) → SVG Y (0-500) vertical position

  const scaleToSvgX = (y: number, teamId: string) => {
    // Away team shoots at left basket (x increases from left)
    if (teamId === awayTeamId) {
      return y * 10; // 0-30 feet from left baseline
    }
    // Home team shoots at right basket (x decreases from right)
    return courtWidth - (y * 10); // 0-30 feet from right baseline
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-slate-700/30 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap gap-4">
          {/* Team Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-400 font-semibold">Team:</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value as 'all' | 'away' | 'home')}
              className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">Both Teams</option>
              <option value="away">{awayTeamName}</option>
              <option value="home">{homeTeamName}</option>
            </select>
          </div>

          {/* Quarter Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-400 font-semibold">Quarter:</label>
            <select
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(e.target.value)}
              className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Quarters</option>
              <option value="1">Q1</option>
              <option value="2">Q2</option>
              <option value="3">Q3</option>
              <option value="4">Q4</option>
            </select>
          </div>

          {/* Player Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-400 font-semibold">Player:</label>
            <select
              value={selectedPlayer}
              onChange={(e) => setSelectedPlayer(e.target.value)}
              className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Players</option>
              {players.map(player => (
                <option key={player.id} value={player.id}>{player.name}</option>
              ))}
            </select>
          </div>

          {/* Shot Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-400 font-semibold">Result:</label>
            <select
              value={shotFilter}
              onChange={(e) => setShotFilter(e.target.value as 'all' | 'made' | 'missed')}
              className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Shots</option>
              <option value="made">Made</option>
              <option value="missed">Missed</option>
            </select>
          </div>
        </div>

        {/* Statistics */}
        <div className="flex items-center gap-6 pt-2 border-t border-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 uppercase font-bold">Total:</span>
            <span className="text-lg font-black text-white">{totalShots}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-green-400 uppercase font-bold">Made:</span>
            <span className="text-lg font-black text-green-400">{madeShots}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400 uppercase font-bold">Missed:</span>
            <span className="text-lg font-black text-red-400">{missedShots}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-orange-400 uppercase font-bold">FG%:</span>
            <span className="text-lg font-black text-orange-400">{fgPercentage}%</span>
          </div>
        </div>
      </div>

      {/* Shot Chart */}
      <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-8 border border-slate-700 shadow-xl">
        <svg
          viewBox={`0 0 ${courtWidth} ${courtHeight}`}
          className="w-full h-auto"
          style={{ maxHeight: '700px' }}
        >
          {/* Court background */}
          <rect x="0" y="0" width={courtWidth} height={courtHeight} fill="#1e293b" />

          {/* Court outline */}
          <rect x="0" y="0" width={courtWidth} height={courtHeight} stroke="#475569" strokeWidth="3" fill="none" />

          {/* Center line */}
          <line
            x1={courtWidth / 2}
            y1="0"
            x2={courtWidth / 2}
            y2={courtHeight}
            stroke="#475569"
            strokeWidth="2"
          />

          {/* Center circle */}
          <circle
            cx={courtWidth / 2}
            cy={courtHeight / 2}
            r="60"
            stroke="#475569"
            strokeWidth="2"
            fill="none"
          />

          {/* LEFT SIDE - Home basket */}
          {/* Three-point line - left */}
          <path
            d={`
              M 0 ${courtHeight / 2 - 220}
              L 140 ${courtHeight / 2 - 220}
              A 237.5 237.5 0 0 1 140 ${courtHeight / 2 + 220}
              L 0 ${courtHeight / 2 + 220}
            `}
            stroke="#475569"
            strokeWidth="2"
            fill="none"
          />

          {/* Paint/Key - left */}
          <rect
            x="0"
            y={courtHeight / 2 - 80}
            width="190"
            height="160"
            stroke="#475569"
            strokeWidth="2"
            fill="none"
          />

          {/* Free throw circle - left */}
          <circle
            cx="190"
            cy={courtHeight / 2}
            r="60"
            stroke="#475569"
            strokeWidth="2"
            fill="none"
          />

          {/* Restricted area - left */}
          <path
            d={`M 0 ${courtHeight / 2 - 40} A 40 40 0 0 0 0 ${courtHeight / 2 + 40}`}
            stroke="#475569"
            strokeWidth="2"
            fill="none"
          />

          {/* Basket - left */}
          <circle
            cx="40"
            cy={courtHeight / 2}
            r="9"
            stroke="#f97316"
            strokeWidth="2"
            fill="none"
          />

          {/* Backboard - left */}
          <line
            x1="40"
            y1={courtHeight / 2 - 30}
            x2="40"
            y2={courtHeight / 2 + 30}
            stroke="#475569"
            strokeWidth="3"
          />

          {/* RIGHT SIDE - Away basket */}
          {/* Three-point line - right */}
          <path
            d={`
              M ${courtWidth} ${courtHeight / 2 - 220}
              L ${courtWidth - 140} ${courtHeight / 2 - 220}
              A 237.5 237.5 0 0 0 ${courtWidth - 140} ${courtHeight / 2 + 220}
              L ${courtWidth} ${courtHeight / 2 + 220}
            `}
            stroke="#475569"
            strokeWidth="2"
            fill="none"
          />

          {/* Paint/Key - right */}
          <rect
            x={courtWidth - 190}
            y={courtHeight / 2 - 80}
            width="190"
            height="160"
            stroke="#475569"
            strokeWidth="2"
            fill="none"
          />

          {/* Free throw circle - right */}
          <circle
            cx={courtWidth - 190}
            cy={courtHeight / 2}
            r="60"
            stroke="#475569"
            strokeWidth="2"
            fill="none"
          />

          {/* Restricted area - right */}
          <path
            d={`M ${courtWidth} ${courtHeight / 2 - 40} A 40 40 0 0 1 ${courtWidth} ${courtHeight / 2 + 40}`}
            stroke="#475569"
            strokeWidth="2"
            fill="none"
          />

          {/* Basket - right */}
          <circle
            cx={courtWidth - 40}
            cy={courtHeight / 2}
            r="9"
            stroke="#f97316"
            strokeWidth="2"
            fill="none"
          />

          {/* Backboard - right */}
          <line
            x1={courtWidth - 40}
            y1={courtHeight / 2 - 30}
            x2={courtWidth - 40}
            y2={courtHeight / 2 + 30}
            stroke="#475569"
            strokeWidth="3"
          />

          {/* Shot markers */}
          {filteredShots.map((shot, idx) => {
            const isAway = shot.team_id === awayTeamId;
            const color = shot.made
              ? (isAway ? `#${awayTeamColor}` : `#${homeTeamColor}`)
              : '#ef4444';
            const opacity = shot.made ? 0.7 : 0.5;

            return (
              <circle
                key={`${shot.play_id}-${idx}`}
                cx={scaleToSvgX(shot.y, shot.team_id)}
                cy={scaleToSvgY(shot.x)}
                r="6"
                fill={color}
                opacity={opacity}
                stroke={hoveredShot?.play_id === shot.play_id ? '#fff' : color}
                strokeWidth={hoveredShot?.play_id === shot.play_id ? 3 : 1}
                className="cursor-pointer transition-all duration-200 hover:r-8"
                onMouseEnter={() => setHoveredShot(shot)}
                onMouseLeave={() => setHoveredShot(null)}
              />
            );
          })}
        </svg>

        {/* Hover tooltip */}
        {hoveredShot && (
          <div className="absolute top-8 right-8 bg-slate-900/95 backdrop-blur-sm border-2 border-orange-500 rounded-lg p-4 shadow-2xl shadow-orange-500/20 max-w-xs z-10">
            <div className="flex items-center gap-3 mb-3">
              {hoveredShot.athlete_headshot && (
                <img
                  src={hoveredShot.athlete_headshot}
                  alt={hoveredShot.athlete_name}
                  className="w-12 h-12 rounded-full bg-slate-700 object-cover ring-2 ring-orange-500/50"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <div className="flex-1">
                <div className="font-bold text-white text-sm">{hoveredShot.athlete_name}</div>
                <div className="text-xs text-slate-400">{hoveredShot.quarter_display} • {hoveredShot.clock}</div>
              </div>
            </div>
            <div className={`text-sm font-semibold mb-2 ${hoveredShot.made ? 'text-green-400' : 'text-red-400'}`}>
              {hoveredShot.text}
            </div>
            <div className="text-xs text-slate-400">
              {hoveredShot.shot_type} • {hoveredShot.score_value} {hoveredShot.score_value === 1 ? 'point' : 'points'}
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Score: {hoveredShot.away_score} - {hoveredShot.home_score}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-8 left-8 bg-slate-900/80 backdrop-blur-sm rounded-lg p-3 border border-slate-600">
          <div className="text-xs font-bold text-slate-400 mb-2">Legend</div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full`} style={{ backgroundColor: `#${awayTeamColor}` }}></div>
              <span className="text-xs text-slate-300">{awayTeamName.split(' ').pop()} Made</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full`} style={{ backgroundColor: `#${homeTeamColor}` }}></div>
              <span className="text-xs text-slate-300">{homeTeamName.split(' ').pop()} Made</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-red-500"></div>
              <span className="text-xs text-slate-300">Missed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
