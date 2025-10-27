import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { playersAPI } from '../lib/api';
import PlayerImage from '../components/PlayerImage';

export default function PlayerSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Properly debounce search with cleanup
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: players, isLoading } = useQuery({
    queryKey: ['players-search', debouncedQuery],
    queryFn: () => playersAPI.search(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-bold mb-2">Player Search</h1>
        <p className="text-slate-400">
          Search for any NBA player to view their stats and shot charts
        </p>
      </div>

      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for a player (e.g., LeBron James, Michael Jordan)..."
          className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
        />
        {isLoading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="animate-spin h-5 w-5 border-2 border-orange-500 border-t-transparent rounded-full"></div>
          </div>
        )}
      </div>

      {/* Results */}
      {debouncedQuery.length >= 2 && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center text-slate-400 py-8">Searching...</div>
          ) : players && players.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {players.map((player) => (
                <Link
                  key={player.athlete_id}
                  to={`/player/${player.athlete_id}`}
                  className="flex items-center space-x-4 p-4 bg-slate-800 border border-slate-700 rounded-lg hover:border-orange-500 transition-colors"
                >
                  <PlayerImage
                    src={player.athlete_headshot}
                    alt={player.athlete_display_name}
                    className="w-16 h-16 rounded-full bg-slate-700 text-2xl"
                    fallbackInitial={player.athlete_display_name.charAt(0)}
                  />
                  <div>
                    <h3 className="font-bold text-lg">
                      {player.athlete_display_name}
                    </h3>
                    {player.athlete_position && (
                      <p className="text-sm text-slate-400">
                        {player.athlete_position}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center text-slate-400 py-8">
              No players found. Try a different search term.
            </div>
          )}
        </div>
      )}

      {/* Suggestions */}
      {debouncedQuery.length < 2 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h3 className="font-bold mb-3">Popular Searches</h3>
          <div className="flex flex-wrap gap-2">
            {[
              'LeBron James',
              'Michael Jordan',
              'Kobe Bryant',
              'Stephen Curry',
              'Kevin Durant',
              'Giannis',
            ].map((name) => (
              <button
                key={name}
                onClick={() => setSearchQuery(name)}
                className="px-4 py-2 bg-slate-700 rounded-full text-sm hover:bg-slate-600 transition-colors"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
