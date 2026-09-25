import { Link } from 'react-router-dom';
import {
  parseDellStatusRaw,
  getDispatchHeadline,
  getDellServiceInfo,
  extractDpsNumber,
  extractRelatedWorkOrder,
} from '../utils/parseDellStatusRaw';
import { buildDispatchTimeline } from '../utils/buildDispatchTimeline';
import DellDispatchStatusTimeline from './DellDispatchStatusTimeline';

const STATUS_CLASS = {
  draft: 'bg-gray-600/40 text-gray-300 border-gray-500/30',
  queued: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  submitted: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  issued: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  shipped: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  denied: 'bg-red-500/20 text-red-300 border-red-500/30',
  received: 'bg-green-500/20 text-green-300 border-green-500/30',
  installed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

function Field({ label, children, mono, multiline }) {
  if (children == null || children === '' || children === '—') return null;
  return (
    <div className={multiline ? 'sm:col-span-2' : undefined}>
      <dt className="text-[11px] uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`text-sm text-gray-200 mt-0.5 ${mono ? 'font-mono' : ''} ${multiline ? 'whitespace-pre-wrap' : ''}`}>
        {children}
      </dd>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">{title}</h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">{children}</dl>
    </section>
  );
}

export default function DellDispatchDetailModal({
  dispatch: d,
  onClose,
  onPreview,
  onSubmit,
  onRefresh,
  onMarkLocal,
  onDelete,
  busyAction,
  submitInFlight,
}) {
  if (!d) return null;

  const wo = d.dps_number || d.work_order;
  const shipLine = [
    d.ship_address_line1,
    d.ship_address_line2,
    [d.ship_city, d.ship_state, d.ship_zip].filter(Boolean).join(', '),
    d.ship_country,
  ]
    .filter(Boolean)
    .join('\n');

  const headline = getDispatchHeadline(d);
  const dell = parseDellStatusRaw(d.dell_status_raw, { local: d, dellOnly: true });
  const timeline = buildDispatchTimeline(d);
  const service = getDellServiceInfo(d.dell_status_raw);
  const linkedDps =
    extractDpsNumber(dell.deniedReason || d.dell_last_error || d.dell_status_raw) ||
    extractDpsNumber(d.dell_status_raw);
  const linkedWo = dell.relatedWorkOrder || extractRelatedWorkOrder(d.dell_last_error);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-700 flex justify-between items-start gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded text-xs border ${STATUS_CLASS[headline.badge] || STATUS_CLASS[d.status] || STATUS_CLASS.draft}`}>
                {headline.badge}
              </span>
              <span className="text-xs text-gray-500">Dispatch #{d.id}</span>
              {wo && <span className="text-xs font-mono text-cyan-400">{wo}</span>}
            </div>
            <h2 className="text-lg font-bold text-gray-100 truncate">
              #{d.customer_id}
              {d.customer_alias ? ` · ${d.customer_alias}` : d.customer_name ? ` · ${d.customer_name}` : ''}
            </h2>
            <p className="text-sm text-gray-300 mt-0.5 font-medium">{headline.title}</p>
            <p className="text-sm text-gray-400 mt-0.5">
              {d.node_name || 'Node'} ·{' '}
              <span className="font-mono text-cyan-400">{d.service_tag}</span>
              {d.part_number ? ` · ${d.part_number}` : ''}
            </p>
            {headline.subtitle && <p className="text-xs text-gray-500 mt-1">{headline.subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none shrink-0"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-6">
          {(headline.relatedWorkOrder || linkedDps) && (
            <div className="rounded-lg border border-yellow-700/50 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-100 space-y-2">
              {headline.relatedWorkOrder && (
                <p>
                  Dell says this is a duplicate — see work order{' '}
                  <span className="font-mono font-semibold">{headline.relatedWorkOrder}</span>.
                </p>
              )}
              {linkedDps && (
                <p>
                  Active part dispatch may be under{' '}
                  <span className="font-mono font-semibold">DPS# {linkedDps}</span>.
                </p>
              )}
              {(linkedWo || linkedDps) && !wo && (
                <p className="text-yellow-200/90">
                  Use <strong>Submit to Dell</strong> — we will link this row to the real Dell work order automatically.
                </p>
              )}
            </div>
          )}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Status history</h3>
            {(service.technician || service.waybill || service.lastUpdate) && (
              <div className="rounded-lg border border-cyan-800/40 bg-cyan-950/20 px-4 py-3 text-sm text-cyan-50/95 mb-4 space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-cyan-300/90">On-site service (Dell API)</div>
                {service.technician && (
                  <p>
                    Scheduled technician: <span className="font-medium">{service.technician}</span>
                  </p>
                )}
                {service.waybill && (
                  <p>
                    Parts tracking: <span className="font-mono">{service.waybill}</span>
                  </p>
                )}
                {service.lastUpdate && (
                  <p className="text-cyan-100/80 text-xs">Last Dell update: {service.lastUpdate}</p>
                )}
                <p className="text-xs text-cyan-200/70 pt-1 leading-relaxed">
                  Appointment windows and “technician en route” updates appear on dell.com only — the TechDirect inquiry API
                  returns status, technician, tracking, and last update time, not the full portal timeline.
                </p>
              </div>
            )}
            <DellDispatchStatusTimeline entries={timeline} />
          </section>

          {dell.fields.length > 0 && (
            <Section title="Current Dell snapshot">
              {dell.fields.map((f) => (
                <Field key={f.label} label={f.label} mono={f.mono} multiline={f.multiline}>
                  {f.value}
                </Field>
              ))}
            </Section>
          )}

          {dell.parts.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Extra parts on Dell WO</h3>
              <div className="space-y-2">
                {dell.parts.map((p, i) => (
                  <div key={i} className="rounded-lg border border-gray-700/80 bg-gray-900/40 p-3 text-sm">
                    <div className="font-mono text-cyan-300">{p.part_number}</div>
                    {p.part_description && <div className="text-gray-300 mt-1">{p.part_description}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <Section title="Request">
            <Field label="Part" mono>
              {d.part_number}
              {d.part_description ? ` — ${d.part_description}` : ''}
            </Field>
            <Field label="Quantity">{d.part_qty || 1}</Field>
            {d.part_ppid && (
              <Field label="PPID" mono>
                {d.part_ppid}
              </Field>
            )}
            {d.troubleshooting_note && (
              <div className="sm:col-span-2">
                <Field label="Troubleshooting note" multiline>
                  {d.troubleshooting_note}
                </Field>
              </div>
            )}
            <Field label="Ship to" multiline>
              {shipLine}
            </Field>
            <Field label="Primary contact">
              {[d.primary_contact_name, d.primary_contact_phone, d.primary_contact_email].filter(Boolean).join(' · ')}
            </Field>
            {(d.alternate_contact_name || d.alternate_contact_phone) && (
              <Field label="Alternate contact">
                {[d.alternate_contact_name, d.alternate_contact_phone].filter(Boolean).join(' · ')}
              </Field>
            )}
            <Field label="Dell account">
              {[d.branch_name, d.dell_customer_name, d.track].filter(Boolean).join(' · ')}
            </Field>
            <Field label="Options">
              {[
                d.request_complete_care ? 'Complete Care' : null,
                d.request_return_to_depot ? 'Return to depot' : null,
                d.request_onsite_technician ? 'Onsite technician' : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Self-replace'}
            </Field>
            <Field label="Warranty">
              {d.warranty_in_coverage === 1
                ? 'In coverage'
                : d.warranty_in_coverage === 0
                  ? 'Out of coverage'
                  : null}
              {d.warranty_ends ? ` (ends ${d.warranty_ends})` : ''}
            </Field>
          </Section>

          {(d.attachments || []).length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Evidence</h3>
              <div className="flex flex-wrap gap-2">
                {d.attachments.map((a) =>
                  a.is_image ? (
                    <button
                      key={a.id}
                      type="button"
                      className="block w-16 h-16 rounded border border-gray-600 overflow-hidden bg-gray-900 hover:border-blue-400"
                      title={a.filename}
                      onClick={() => onPreview?.(a)}
                    >
                      <img src={a.url} alt={a.filename} className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <button
                      key={a.id}
                      type="button"
                      className="px-2 py-1 rounded text-xs bg-gray-700 text-blue-300 hover:bg-gray-600"
                      onClick={() => onPreview?.(a)}
                    >
                      {a.filename}
                    </button>
                  )
                )}
              </div>
            </section>
          )}

          {d.dell_last_error && !dell.deniedReason && (
            <div className="rounded-lg border border-yellow-700/40 bg-yellow-900/15 px-3 py-2 text-sm text-yellow-200">
              {d.dell_last_error}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-700 flex flex-wrap gap-2 justify-between shrink-0 bg-gray-800/95">
          <div className="flex flex-wrap gap-3 items-center">
            <Link
              to={`/customer/${d.customer_id}?tab=parts`}
              className="text-xs text-gray-400 hover:text-blue-400"
            >
              Customer profile →
            </Link>
            <button
              type="button"
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
              disabled={Boolean(busyAction)}
              onClick={() => onDelete?.(d.id)}
            >
              Delete request
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {!wo && (
              <button
                type="button"
                className="btn btn-primary text-sm disabled:opacity-40"
                disabled={submitInFlight || Boolean(busyAction)}
                onClick={() => onSubmit?.(d.id)}
              >
                {busyAction?.type === 'submit' && busyAction.id === d.id ? 'Sending…' : 'Submit to Dell'}
              </button>
            )}
            {wo && (
              <button
                type="button"
                className="btn btn-secondary text-sm disabled:opacity-40"
                disabled={Boolean(busyAction)}
                onClick={() => onRefresh?.(d.id)}
              >
                {busyAction?.type === 'refresh' && busyAction.id === d.id ? 'Updating…' : 'Update from Dell'}
              </button>
            )}
            {['submitted', 'issued', 'shipped'].includes(d.status) && (
              <button
                type="button"
                className="btn btn-secondary text-sm disabled:opacity-40"
                disabled={Boolean(busyAction)}
                onClick={() => onMarkLocal?.(d.id, 'received')}
              >
                Mark received
              </button>
            )}
            {d.status === 'received' && (
              <button
                type="button"
                className="btn btn-secondary text-sm disabled:opacity-40"
                disabled={Boolean(busyAction)}
                onClick={() => onMarkLocal?.(d.id, 'installed')}
              >
                Mark installed
              </button>
            )}
            <button type="button" className="btn btn-secondary text-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
