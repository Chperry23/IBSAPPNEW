/**
 * Full-screen blocking overlay while a Dell API action is in flight.
 */
export default function DellSubmitOverlay({ title = 'Please wait…', detail }) {
  return (
    <div
      className="modal-backdrop modal-backdrop-priority"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="polite"
      aria-label={title}
    >
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 flex flex-col items-center gap-4 max-w-md text-center shadow-2xl">
        <div className="spinner h-12 w-12 border-t-orange-500" />
        <div className="text-lg font-semibold text-white">{title}</div>
        {detail && <p className="text-sm text-gray-400 leading-relaxed">{detail}</p>}
        <p className="text-xs text-gray-500">Do not close this page until finished.</p>
      </div>
    </div>
  );
}
