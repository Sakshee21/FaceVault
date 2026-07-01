export default function StatusCard({ record, loading }) {
  if (loading) {
    return (
      <div className="card animate-pulse">
        <div className="h-4 bg-gray-800 rounded w-1/3 mb-3" />
        <div className="h-3 bg-gray-800 rounded w-2/3" />
      </div>
    );
  }

  if (!record || !record.exists) {
    return (
      <div className="card border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚪</span>
          <div>
            <p className="font-semibold text-gray-300">Not registered</p>
            <p className="text-sm text-gray-500">Your face is not yet in the consent registry.</p>
          </div>
        </div>
      </div>
    );
  }

  const ts = record.registered_at
    ? new Date(record.registered_at * 1000).toLocaleDateString()
    : "–";

  return (
    <div className="card border-green-800 bg-green-900/10">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">✅</span>
        <div>
          <p className="font-semibold text-green-400">Registered on-chain</p>
          <p className="text-xs text-gray-500">Since {ts}</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Face hash</p>
        <p className="hash-display">{record.face_hash}</p>
      </div>

      <div className="mt-4 flex gap-3 flex-wrap">
        {[
          { label: "Artistic", val: record.allow_artistic },
          { label: "Commercial", val: record.allow_commercial },
          { label: "Allow All", val: record.allow_all },
        ].map(({ label, val }) => (
          <span
            key={label}
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              val
                ? "bg-green-800/50 text-green-300"
                : "bg-gray-800 text-gray-500"
            }`}
          >
            {label}: {val ? "✓" : "✗"}
          </span>
        ))}
      </div>
    </div>
  );
}
