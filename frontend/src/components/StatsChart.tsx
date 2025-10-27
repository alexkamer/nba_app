import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { PlayerSeasonStats } from '../types';

interface StatsChartProps {
  seasons: PlayerSeasonStats[];
}

export default function StatsChart({ seasons }: StatsChartProps) {
  // Sort by season
  const sortedSeasons = [...seasons].sort((a, b) => Number(a.season) - Number(b.season));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={sortedSeasons}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="season"
          stroke="#94a3b8"
          style={{ fontSize: '12px' }}
        />
        <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1e293b',
            border: '1px solid #475569',
            borderRadius: '0.5rem',
          }}
          labelStyle={{ color: '#f1f5f9' }}
        />
        <Legend
          wrapperStyle={{ paddingTop: '20px' }}
          iconType="line"
        />
        <Line
          type="monotone"
          dataKey="avg_points"
          stroke="#f97316"
          strokeWidth={2}
          dot={{ fill: '#f97316', r: 4 }}
          name="Points"
        />
        <Line
          type="monotone"
          dataKey="avg_rebounds"
          stroke="#22c55e"
          strokeWidth={2}
          dot={{ fill: '#22c55e', r: 4 }}
          name="Rebounds"
        />
        <Line
          type="monotone"
          dataKey="avg_assists"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ fill: '#3b82f6', r: 4 }}
          name="Assists"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
