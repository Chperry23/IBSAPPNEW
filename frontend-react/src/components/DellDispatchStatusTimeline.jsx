const SOURCE_COLOR = {
  Created: 'bg-gray-500',
  'Submitted to Dell': 'bg-blue-500',
  'Updated from Dell': 'bg-cyan-500',
  'Linked to Dell': 'bg-emerald-500',
  'Imported from Dell': 'bg-emerald-500',
  'Local update': 'bg-orange-500',
};

export default function DellDispatchStatusTimeline({ entries }) {
  if (!entries?.length) {
    return <p className="text-sm text-gray-500">No status history yet — use “Update from Dell” to pull the latest.</p>;
  }

  return (
    <ol className="relative border-l border-gray-600/80 ml-2 space-y-0">
      {entries.map((e, i) => (
        <li key={`${e.at}-${i}`} className="relative pl-6 pb-6 last:pb-0">
          <span
            className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-gray-800 ${SOURCE_COLOR[e.source] || 'bg-gray-400'}`}
          />
          <div className="text-[11px] uppercase tracking-wide text-gray-500">{e.source}</div>
          <div className="text-xs text-gray-400">{e.at ? new Date(e.at).toLocaleString() : '—'}</div>
          <div className="text-sm font-medium text-gray-100 mt-0.5">{e.title}</div>
          {e.detail && e.detail !== e.title && (
            <div className="text-sm text-gray-400 mt-0.5">{e.detail}</div>
          )}
          {e.workOrder && (
            <div className="text-xs font-mono text-cyan-400/90 mt-1">{e.workOrder}</div>
          )}
          {e.note && (
            <div className="text-sm text-gray-300 mt-2 rounded-lg bg-gray-900/60 border border-gray-700/60 px-3 py-2 whitespace-pre-wrap leading-relaxed">
              {e.note}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
