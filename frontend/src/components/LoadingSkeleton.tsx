export function StatCardSkeleton() {
  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 animate-pulse">
      <div className="h-6 bg-slate-700 rounded w-2/3 mb-4"></div>
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center justify-between p-2">
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
    </div>
  );
}

export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="animate-pulse">
      {[...Array(columns)].map((_, i) => (
        <td key={i} className="py-3 px-4">
          <div className="h-4 bg-slate-700 rounded w-full"></div>
        </td>
      ))}
    </tr>
  );
}

export function PlayerCardSkeleton() {
  return (
    <div className="flex items-center space-x-6 bg-slate-800 rounded-lg p-6 border border-slate-700 animate-pulse">
      <div className="w-32 h-32 rounded-full bg-slate-700"></div>
      <div className="flex-1">
        <div className="h-10 bg-slate-700 rounded w-1/3 mb-2"></div>
        <div className="flex items-center space-x-4">
          <div className="h-6 bg-slate-700 rounded w-20"></div>
          <div className="h-6 bg-slate-700 rounded w-16"></div>
          <div className="h-6 bg-slate-700 rounded w-24"></div>
        </div>
      </div>
    </div>
  );
}

export function StatGridSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="bg-slate-800 border border-slate-700 rounded-lg p-6 animate-pulse"
        >
          <div className="h-4 bg-slate-700 rounded w-2/3 mb-3"></div>
          <div className="h-8 bg-slate-700 rounded w-1/2 mb-2"></div>
          <div className="h-3 bg-slate-700 rounded w-3/4"></div>
        </div>
      ))}
    </div>
  );
}
