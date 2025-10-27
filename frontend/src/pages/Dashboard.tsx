import { useQuery } from '@tanstack/react-query';
import { statsAPI } from '../lib/api';
import { Link } from 'react-router-dom';
import { StatCardSkeleton } from '../components/LoadingSkeleton';

export default function Dashboard() {
  const { data: pointsLeaders, isLoading: loadingPoints } = useQuery({
    queryKey: ['stat-leaders', 'avg_points'],
    queryFn: () => statsAPI.getLeaders('avg_points', undefined, 10),
  });

  const { data: assistsLeaders, isLoading: loadingAssists } = useQuery({
    queryKey: ['stat-leaders', 'avg_assists'],
    queryFn: () => statsAPI.getLeaders('avg_assists', undefined, 10),
  });

  const { data: reboundsLeaders, isLoading: loadingRebounds } = useQuery({
    queryKey: ['stat-leaders', 'avg_rebounds'],
    queryFn: () => statsAPI.getLeaders('avg_rebounds', undefined, 10),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold mb-2">NBA Analytics Dashboard</h1>
        <p className="text-slate-400">
          Explore player stats, shot charts, and historical trends
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Points Leaders */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold mb-4 text-orange-500">
            Points Per Game Leaders
          </h2>
          {loadingPoints ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-2 animate-pulse">
                  <div className="flex items-center space-x-3 flex-1">
                    <div className="w-8 h-8 bg-slate-700 rounded"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-slate-700 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-slate-700 rounded w-1/2"></div>
                    </div>
                  </div>
                  <div className="w-12 h-6 bg-slate-700 rounded"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {pointsLeaders?.leaders.slice(0, 5).map((leader, idx) => (
                <Link
                  key={`${leader.athlete_id}-${leader.season}`}
                  to={`/player/${leader.athlete_id}`}
                  className="flex items-center justify-between p-2 rounded hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl font-bold text-slate-600">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="font-medium">{leader.athlete_name}</div>
                      <div className="text-sm text-slate-400">
                        {leader.season}
                      </div>
                    </div>
                  </div>
                  <div className="text-xl font-bold text-orange-500">
                    {leader.stat_value.toFixed(1)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Assists Leaders */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold mb-4 text-blue-500">
            Assists Per Game Leaders
          </h2>
          {loadingAssists ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-2 animate-pulse">
                  <div className="flex items-center space-x-3 flex-1">
                    <div className="w-8 h-8 bg-slate-700 rounded"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-slate-700 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-slate-700 rounded w-1/2"></div>
                    </div>
                  </div>
                  <div className="w-12 h-6 bg-slate-700 rounded"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {assistsLeaders?.leaders.slice(0, 5).map((leader, idx) => (
                <Link
                  key={`${leader.athlete_id}-${leader.season}`}
                  to={`/player/${leader.athlete_id}`}
                  className="flex items-center justify-between p-2 rounded hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl font-bold text-slate-600">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="font-medium">{leader.athlete_name}</div>
                      <div className="text-sm text-slate-400">
                        {leader.season}
                      </div>
                    </div>
                  </div>
                  <div className="text-xl font-bold text-blue-500">
                    {leader.stat_value.toFixed(1)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Rebounds Leaders */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold mb-4 text-green-500">
            Rebounds Per Game Leaders
          </h2>
          {loadingRebounds ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-2 animate-pulse">
                  <div className="flex items-center space-x-3 flex-1">
                    <div className="w-8 h-8 bg-slate-700 rounded"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-slate-700 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-slate-700 rounded w-1/2"></div>
                    </div>
                  </div>
                  <div className="w-12 h-6 bg-slate-700 rounded"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {reboundsLeaders?.leaders.slice(0, 5).map((leader, idx) => (
                <Link
                  key={`${leader.athlete_id}-${leader.season}`}
                  to={`/player/${leader.athlete_id}`}
                  className="flex items-center justify-between p-2 rounded hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl font-bold text-slate-600">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="font-medium">{leader.athlete_name}</div>
                      <div className="text-sm text-slate-400">
                        {leader.season}
                      </div>
                    </div>
                  </div>
                  <div className="text-xl font-bold text-green-500">
                    {leader.stat_value.toFixed(1)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h2 className="text-xl font-bold mb-4">Explore</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            to="/players"
            className="p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
          >
            <h3 className="font-bold mb-1">Search Players</h3>
            <p className="text-sm text-slate-400">
              Find any NBA player and view their stats
            </p>
          </Link>
          <div className="p-4 bg-slate-700 rounded-lg opacity-50 cursor-not-allowed">
            <h3 className="font-bold mb-1">Team Analytics</h3>
            <p className="text-sm text-slate-400">Coming soon...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
