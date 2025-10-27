import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

// NBA Division mappings (using ESPN API abbreviations)
const DIVISIONS: Record<string, string> = {
  // Eastern Conference - Atlantic
  'BOS': 'Atlantic', 'BKN': 'Atlantic', 'NY': 'Atlantic', 'NYK': 'Atlantic', 'PHI': 'Atlantic', 'TOR': 'Atlantic',
  // Eastern Conference - Central
  'CHI': 'Central', 'CLE': 'Central', 'DET': 'Central', 'IND': 'Central', 'MIL': 'Central',
  // Eastern Conference - Southeast
  'ATL': 'Southeast', 'CHA': 'Southeast', 'MIA': 'Southeast', 'ORL': 'Southeast', 'WAS': 'Southeast', 'WSH': 'Southeast',
  // Western Conference - Northwest
  'DEN': 'Northwest', 'MIN': 'Northwest', 'OKC': 'Northwest', 'POR': 'Northwest', 'UTA': 'Northwest', 'UTAH': 'Northwest',
  // Western Conference - Pacific
  'GSW': 'Pacific', 'GS': 'Pacific', 'LAC': 'Pacific', 'LAL': 'Pacific', 'PHX': 'Pacific', 'SAC': 'Pacific',
  // Western Conference - Southwest
  'DAL': 'Southwest', 'HOU': 'Southwest', 'MEM': 'Southwest', 'NOR': 'Southwest', 'NO': 'Southwest', 'SAS': 'Southwest', 'SA': 'Southwest'
};

export default function Teams() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'all' | 'conference' | 'division'>('division');
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);

  const { data: standings, isLoading, error } = useQuery({
    queryKey: ['standings', selectedSeason],
    queryFn: async () => {
      const url = selectedSeason
        ? `${API_BASE_URL}/teams/live/standings?season=${selectedSeason}`
        : `${API_BASE_URL}/teams/live/standings`;
      const { data } = await axios.get(url);
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-16 w-16 border-4 border-orange-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-6 text-center">
        <p className="text-red-400">Error loading standings. Please try again.</p>
      </div>
    );
  }

  const renderStandingsTable = (teams: any[], title: string) => {
    if (!teams || teams.length === 0) return null;

    // Determine playoff format based on season
    const currentSeason = standings?.season;
    const hasPlayIn = !currentSeason || currentSeason >= 2021;

    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4">
          <h2 className="text-2xl font-black text-white">
            {viewMode === 'all' ? title : `${title} Conference`}
          </h2>
        </div>

        {/* Standings Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700/50 border-b-2 border-slate-700">
              <tr>
                <th className="py-3 px-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Team
                </th>
                <th className="py-3 px-4 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                  W
                </th>
                <th className="py-3 px-4 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                  L
                </th>
                <th className="py-3 px-4 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                  PCT
                </th>
                <th className="py-3 px-4 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                  GB
                </th>
                <th className="py-3 px-4 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Home
                </th>
                <th className="py-3 px-4 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Away
                </th>
                <th className="py-3 px-4 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                  L10
                </th>
                <th className="py-3 px-4 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Strk
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {teams.map((team) => {
                // Different playoff formats based on season
                let isTopSeed, isPlayIn;

                if (hasPlayIn) {
                  // Current format: 1-6 playoff, 7-10 play-in
                  isTopSeed = team.rank <= 6;
                  isPlayIn = team.rank > 6 && team.rank <= 10;
                } else {
                  // Pre-2021 format: 1-8 playoff
                  isTopSeed = team.rank <= 8;
                  isPlayIn = false;
                }

                let rankBorder = '';

                if (isTopSeed) {
                  rankBorder = 'border-l-4 border-l-green-500';
                } else if (isPlayIn) {
                  rankBorder = 'border-l-4 border-l-yellow-500';
                }

                return (
                  <tr
                    key={team.team_id}
                    onClick={() => navigate(`/team/${team.team_id}`)}
                    className={`hover:bg-slate-700/50 transition-all duration-200 cursor-pointer ${rankBorder}`}
                  >
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        {team.team_logo && (
                          <img
                            src={team.team_logo}
                            alt={team.team_name}
                            className="w-10 h-10 object-contain"
                          />
                        )}
                        <div>
                          <div className="font-bold text-white hover:text-orange-400 transition-colors">
                            {team.team_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            #{team.rank} • {team.division}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center font-bold text-green-400">{team.wins}</td>
                    <td className="py-4 px-4 text-center font-bold text-red-400">{team.losses}</td>
                    <td className="py-4 px-4 text-center font-semibold">{team.win_pct}</td>
                    <td className="py-4 px-4 text-center text-slate-400">{team.games_back}</td>
                    <td className="py-4 px-4 text-center text-sm text-slate-300">{team.home_record}</td>
                    <td className="py-4 px-4 text-center text-sm text-slate-300">{team.away_record}</td>
                    <td className="py-4 px-4 text-center text-sm font-semibold">{team.last_10}</td>
                    <td className="py-4 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${
                          team.streak?.startsWith('W')
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {team.streak}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Playoff Legend */}
        <div className="bg-slate-700/30 px-6 py-4 flex flex-wrap gap-6 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500/20 border-2 border-green-500 rounded"></div>
            <span className="text-slate-400">
              {hasPlayIn ? 'Playoff Position (1-6)' : 'Playoff Position (1-8)'}
            </span>
          </div>
          {hasPlayIn && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-500/20 border-2 border-yellow-500 rounded"></div>
              <span className="text-slate-400">Play-In Position (7-10)</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDivisionStandings = (divisionName: string, conference: string) => {
    const divisionTeams = allTeams
      .filter(t => t.division === divisionName && t.conference_abbr === (conference === 'Eastern' ? 'East' : 'West'))
      .sort((a, b) => (a.rank || 999) - (b.rank || 999));

    if (divisionTeams.length === 0) return null;

    // Determine playoff format based on season
    const currentSeason = standings?.season;
    const hasPlayIn = !currentSeason || currentSeason >= 2021;

    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        {/* Division Header */}
        <div className="bg-slate-700/50 px-4 py-3 border-b border-slate-700">
          <h3 className="font-bold text-lg text-white">{divisionName}</h3>
        </div>

        {/* Compact Table */}
        <table className="w-full text-sm">
          <thead className="bg-slate-700/30 border-b border-slate-700">
            <tr>
              <th className="py-2 px-3 text-left text-xs font-bold text-slate-400 uppercase">Team</th>
              <th className="py-2 px-2 text-center text-xs font-bold text-slate-400 uppercase">W</th>
              <th className="py-2 px-2 text-center text-xs font-bold text-slate-400 uppercase">L</th>
              <th className="py-2 px-2 text-center text-xs font-bold text-slate-400 uppercase">PCT</th>
              <th className="py-2 px-2 text-center text-xs font-bold text-slate-400 uppercase">GB</th>
              <th className="py-2 px-2 text-center text-xs font-bold text-slate-400 uppercase">Home</th>
              <th className="py-2 px-2 text-center text-xs font-bold text-slate-400 uppercase">Away</th>
              <th className="py-2 px-2 text-center text-xs font-bold text-slate-400 uppercase">L10</th>
              <th className="py-2 px-2 text-center text-xs font-bold text-slate-400 uppercase">Strk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {divisionTeams.map((team) => {
              // Different playoff formats based on season
              let isTopSeed, isPlayIn;

              if (hasPlayIn) {
                // Current format: 1-6 playoff, 7-10 play-in
                isTopSeed = team.rank <= 6;
                isPlayIn = team.rank > 6 && team.rank <= 10;
              } else {
                // Pre-2021 format: 1-8 playoff
                isTopSeed = team.rank <= 8;
                isPlayIn = false;
              }

              let rankIndicator = '';

              if (isTopSeed) {
                rankIndicator = 'border-l-4 border-l-green-500';
              } else if (isPlayIn) {
                rankIndicator = 'border-l-4 border-l-yellow-500';
              }

              return (
                <tr
                  key={team.team_id}
                  onClick={() => navigate(`/team/${team.team_id}`)}
                  className={`hover:bg-slate-700/50 transition-colors cursor-pointer ${rankIndicator}`}
                >
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      {team.team_logo && (
                        <img
                          src={team.team_logo}
                          alt={team.team_abbreviation}
                          className="w-6 h-6 object-contain"
                        />
                      )}
                      <div>
                        <div className="font-semibold text-white">{team.team_abbreviation}</div>
                        <div className="text-xs text-slate-500">#{team.rank}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center font-bold text-green-400">{team.wins}</td>
                  <td className="py-3 px-2 text-center font-bold text-red-400">{team.losses}</td>
                  <td className="py-3 px-2 text-center font-semibold">{team.win_pct}</td>
                  <td className="py-3 px-2 text-center text-slate-400 text-xs">{team.games_back}</td>
                  <td className="py-3 px-2 text-center text-slate-300 text-xs">{team.home_record}</td>
                  <td className="py-3 px-2 text-center text-slate-300 text-xs">{team.away_record}</td>
                  <td className="py-3 px-2 text-center text-slate-300 text-xs">{team.last_10}</td>
                  <td className="py-3 px-2 text-center">
                    <span
                      className={`text-xs font-bold ${
                        team.streak?.startsWith('W') ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {team.streak}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // Add division to teams
  const allTeams = [
    ...(standings?.eastern_conference || []).map((t: any) => ({
      ...t,
      division: DIVISIONS[t.team_abbreviation] || 'Unknown'
    })),
    ...(standings?.western_conference || []).map((t: any) => ({
      ...t,
      division: DIVISIONS[t.team_abbreviation] || 'Unknown'
    }))
  ];

  // Get unique divisions grouped by conference
  const easternDivisions = ['Atlantic', 'Central', 'Southeast'];
  const westernDivisions = ['Northwest', 'Pacific', 'Southwest'];

  // Organize teams by view mode
  const getTeamsByViewMode = () => {
    if (viewMode === 'all') {
      return [{ name: 'All Teams', teams: allTeams }];
    } else if (viewMode === 'conference') {
      return [
        { name: 'Eastern', teams: allTeams.filter(t => t.conference_abbr === 'East') },
        { name: 'Western', teams: allTeams.filter(t => t.conference_abbr === 'West') }
      ];
    } else {
      // Division view
      return [
        ...easternDivisions.map(div => ({
          name: `${div} (East)`,
          teams: allTeams.filter(t => t.division === div && t.conference_abbr === 'East')
        })),
        ...westernDivisions.map(div => ({
          name: `${div} (West)`,
          teams: allTeams.filter(t => t.division === div && t.conference_abbr === 'West')
        }))
      ];
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-5xl font-black mb-3 bg-gradient-to-r from-orange-500 to-orange-600 bg-clip-text text-transparent">
          NBA Standings
        </h1>
        <p className="text-slate-400 text-lg">
          {standings?.season_display || standings?.season || '2024-25'} Season • {standings?.total_teams} Teams
        </p>
      </div>

      {/* Season Selector */}
      <div className="flex flex-col items-center gap-2">
        <div className="inline-flex bg-slate-800 rounded-xl p-2 border border-slate-700 gap-2">
          <select
            value={selectedSeason || 'current'}
            onChange={(e) => setSelectedSeason(e.target.value === 'current' ? null : e.target.value)}
            className="px-4 py-2 bg-slate-700 text-white rounded-lg font-semibold border border-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
          >
            <option value="current">Current Season (2025-26)</option>
            <option value="2025">2024-25 Season</option>
            <option value="2024">2023-24 Season</option>
            <option value="2023">2022-23 Season</option>
            <option value="2022">2021-22 Season</option>
            <option value="2021">2020-21 Season (Play-In Started)</option>
            <option value="2020">2019-20 Season</option>
            <option value="2019">2018-19 Season</option>
            <option value="2018">2017-18 Season</option>
            <option value="2017">2016-17 Season</option>
            <option value="2016">2015-16 Season</option>
            <option value="2015">2014-15 Season</option>
            <option value="2014">2013-14 Season</option>
            <option value="2013">2012-13 Season</option>
            <option value="2012">2011-12 Season</option>
            <option value="2011">2010-11 Season</option>
            <option value="2010">2009-10 Season</option>
            <option value="2009">2008-09 Season</option>
            <option value="2008">2007-08 Season</option>
            <option value="2007">2006-07 Season</option>
            <option value="2006">2005-06 Season</option>
            <option value="2005">2004-05 Season</option>
            <option value="2004">2003-04 Season</option>
            <option value="2003">2002-03 Season</option>
            <option value="2002">2001-02 Season</option>
            <option value="2001">2000-01 Season</option>
            <option value="2000">1999-00 Season</option>
            <option value="1999">1998-99 Season</option>
            <option value="1998">1997-98 Season</option>
            <option value="1997">1996-97 Season</option>
            <option value="1996">1995-96 Season</option>
            <option value="1995">1994-95 Season</option>
            <option value="1994">1993-94 Season</option>
            <option value="1993">1992-93 Season</option>
            <option value="1992">1991-92 Season</option>
            <option value="1991">1990-91 Season</option>
            <option value="1990">1989-90 Season</option>
            <option value="1989">1988-89 Season</option>
            <option value="1988">1987-88 Season</option>
            <option value="1987">1986-87 Season</option>
            <option value="1986">1985-86 Season</option>
            <option value="1985">1984-85 Season</option>
            <option value="1984">1983-84 Season</option>
            <option value="1983">1982-83 Season</option>
            <option value="1982">1981-82 Season</option>
            <option value="1981">1980-81 Season</option>
            <option value="1980">1979-80 Season</option>
            <option value="1979">1978-79 Season</option>
            <option value="1978">1977-78 Season</option>
            <option value="1977">1976-77 Season</option>
            <option value="1976">1975-76 Season</option>
            <option value="1975">1974-75 Season</option>
            <option value="1974">1973-74 Season</option>
            <option value="1973">1972-73 Season</option>
            <option value="1972">1971-72 Season</option>
            <option value="1971">1970-71 Season</option>
            <option value="1950">1949-50 Season</option>
          </select>
        </div>
        {selectedSeason && parseInt(selectedSeason) < 2021 && (
          <p className="text-xs text-slate-500 italic">
            Note: Play-In Tournament format began in 2020-21 season
          </p>
        )}
      </div>

      {/* View Mode Filter */}
      <div className="flex justify-center">
        <div className="inline-flex bg-slate-800 rounded-xl p-2 border border-slate-700">
          <button
            onClick={() => setViewMode('all')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              viewMode === 'all'
                ? 'bg-orange-500 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            All Teams
          </button>
          <button
            onClick={() => setViewMode('conference')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              viewMode === 'conference'
                ? 'bg-orange-500 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            By Conference
          </button>
          <button
            onClick={() => setViewMode('division')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              viewMode === 'division'
                ? 'bg-orange-500 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            By Division
          </button>
        </div>
      </div>

      {/* Standings Display */}
      {viewMode === 'division' ? (
        <div className="space-y-8">
          {/* Eastern Conference */}
          <div>
            <div className="mb-4">
              <h2 className="text-3xl font-black text-orange-500">Eastern Conference</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {easternDivisions.map(division => (
                <div key={division}>
                  {renderDivisionStandings(division, 'Eastern')}
                </div>
              ))}
            </div>
          </div>

          {/* Western Conference */}
          <div>
            <div className="mb-4">
              <h2 className="text-3xl font-black text-orange-500">Western Conference</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {westernDivisions.map(division => (
                <div key={division}>
                  {renderDivisionStandings(division, 'Western')}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex flex-wrap gap-6 justify-center text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500/20 border-2 border-green-500 rounded"></div>
                <span className="text-slate-400">
                  {(!standings?.season || standings.season >= 2021)
                    ? 'Clinched Playoff Spot (1-6)'
                    : 'Playoff Position (1-8)'}
                </span>
              </div>
              {(!standings?.season || standings.season >= 2021) && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-500/20 border-2 border-yellow-500 rounded"></div>
                  <span className="text-slate-400">Play-In Tournament (7-10)</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className={`grid gap-8 ${viewMode === 'all' ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
          {getTeamsByViewMode().map((group) => (
            <div key={group.name}>
              {renderStandingsTable(group.teams, group.name)}
            </div>
          ))}
        </div>
      )}

      {/* Info Footer */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 text-center">
        <p className="text-slate-400 text-sm">
          Click on any team to view detailed information, roster, and schedule
        </p>
      </div>
    </div>
  );
}
