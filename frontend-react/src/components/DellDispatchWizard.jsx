import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Submit wizard for one Dell service-tag dispatch (HDD / parts).
 * Saves locally; submits to SDSR when CheckLogin works, otherwise queues.
 */
export default function DellDispatchWizard({
  customerId,
  nodeId,
  onClose,
  onSaved,
  showMessage,
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [parts, setParts] = useState([]);
  const [partsError, setPartsError] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const fileRef = useRef(null);

  useEffect(() => {
    loadPrefill();
  }, [customerId, nodeId]);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const loadPrefill = async () => {
    setLoading(true);
    try {
      const q = nodeId != null ? `?nodeId=${encodeURIComponent(nodeId)}` : '';
      const prefill = await fetch(
        `/api/customers/${customerId}/dell-dispatches/prefill${q}`,
        { credentials: 'include' }
      ).then((r) => r.json());

      setForm({
        ...prefill,
        part_number: '',
        part_description: '',
        part_qty: 1,
        part_ppid: '',
        request_complete_care: false,
        request_return_to_depot: false,
        request_onsite_technician: false,
        reference_po: '',
        warranty_ends: prefill.warranty?.warrantyEnds || null,
        warranty_in_coverage: prefill.warranty?.inCoverage ?? null,
        created_by: user?.username || '',
      });

      if (prefill.service_tag) {
        try {
          const partsRes = await fetch(
            `/api/dell-dispatches/parts/${encodeURIComponent(prefill.service_tag)}`,
            { credentials: 'include' }
          ).then((r) => r.json());
          if (partsRes.ok && Array.isArray(partsRes.parts)) {
            setParts(partsRes.parts);
            const hdd = partsRes.parts.find(
              (p) =>
                /hdd|hard.?disk|ssd|solid.?state|drive|storage/i.test(
                  `${p.partDescription || ''} ${p.partTypeCode || ''} ${p.partNumber || ''}`
                )
            );
            if (hdd) {
              setForm((f) => ({
                ...f,
                part_number: hdd.partNumber || '',
                part_description: hdd.partDescription || '',
              }));
            }
          } else {
            setPartsError(partsRes.error || 'Parts list unavailable (Dell login may not be ready)');
          }
        } catch (e) {
          setPartsError(e.message);
        }
      }
    } catch (error) {
      console.error(error);
      showMessage?.('Failed to load dispatch prefill', 'error');
      onClose?.();
    } finally {
      setLoading(false);
    }
  };

  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 8);
    const next = [];
    for (const file of files) {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const comma = result.indexOf(',');
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      next.push({
        filename: file.name,
        mime_type: file.type || 'application/octet-stream',
        description: file.name,
        base64,
      });
    }
    setAttachments((prev) => [...prev, ...next].slice(0, 8));
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async (draftOnly) => {
    if (!form?.service_tag) {
      showMessage?.('Service tag required', 'error');
      return;
    }
    if (!draftOnly && form.warranty_in_coverage === false) {
      const ok = window.confirm(
        'Warranty appears expired. Save as draft/queue anyway? Dell may deny the dispatch.'
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/dell-dispatches`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          draft_only: draftOnly,
          attachments,
        }),
      }).then((r) => r.json());
      if (res.error) {
        showMessage?.(res.error, 'error');
        return;
      }
      showMessage?.(res.message || 'Saved', res.dell_ready ? 'success' : 'info');
      onSaved?.(res.dispatch);
      onClose?.();
    } catch (error) {
      showMessage?.(error.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return (
      <div className="modal-backdrop">
        <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-2xl p-8 flex justify-center">
          <div className="spinner h-10 w-10" />
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-700 flex justify-between items-start sticky top-0 bg-gray-800 z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-100">Request Dell part</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {form.node_name || 'Workstation'} · {form.service_tag || 'no tag'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">
            &times;
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Warranty */}
          <div
            className={`p-3 rounded-lg border text-sm ${
              form.warranty_in_coverage
                ? 'bg-green-900/20 border-green-700/40 text-green-300'
                : form.warranty_in_coverage === false
                  ? 'bg-red-900/20 border-red-700/40 text-red-300'
                  : 'bg-gray-700/40 border-gray-600 text-gray-300'
            }`}
          >
            <div className="font-medium">{form.product_line || 'Dell asset'}</div>
            {form.warranty?.error ? (
              <div className="text-xs mt-1">Warranty check failed: {form.warranty.error}</div>
            ) : (
              <div className="text-xs mt-1">
                {form.warranty_in_coverage
                  ? `In warranty until ${form.warranty_ends ? new Date(form.warranty_ends).toLocaleDateString() : '—'}`
                  : form.warranty_in_coverage === false
                    ? `Out of warranty (ended ${form.warranty_ends ? new Date(form.warranty_ends).toLocaleDateString() : '—'})`
                    : 'Warranty status unknown'}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Service tag</label>
              <input className="form-input w-full" value={form.service_tag || ''} onChange={(e) => setField('service_tag', e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className="form-label">Part number</label>
              <input
                className="form-input w-full"
                list="dell-part-options"
                placeholder="HDD / part code"
                value={form.part_number || ''}
                onChange={(e) => {
                  const pn = e.target.value;
                  const match = parts.find((p) => p.partNumber === pn);
                  setForm((f) => ({
                    ...f,
                    part_number: pn,
                    part_description: match?.partDescription || f.part_description,
                  }));
                }}
              />
              <datalist id="dell-part-options">
                {parts.map((p) => (
                  <option key={p.partNumber} value={p.partNumber}>
                    {p.partDescription}
                  </option>
                ))}
              </datalist>
              {partsError && <p className="text-xs text-yellow-500 mt-1">{partsError}</p>}
            </div>
            <div>
              <label className="form-label">Qty</label>
              <input type="number" min={1} max={4} className="form-input w-full" value={form.part_qty} onChange={(e) => setField('part_qty', Number(e.target.value) || 1)} />
            </div>
            <div>
              <label className="form-label">PPID (optional)</label>
              <input className="form-input w-full" value={form.part_ppid || ''} onChange={(e) => setField('part_ppid', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="form-label">Troubleshooting note (max 1000)</label>
            <textarea
              className="form-input w-full"
              rows={3}
              maxLength={1000}
              value={form.troubleshooting_note || ''}
              onChange={(e) => setField('troubleshooting_note', e.target.value)}
              placeholder="Symptom / failure evidence…"
            />
            <p className="text-xs text-gray-500 text-right">{(form.troubleshooting_note || '').length}/1000</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Primary contact</label>
              <input className="form-input w-full mb-2" placeholder="Name" value={form.primary_contact_name || ''} onChange={(e) => setField('primary_contact_name', e.target.value)} />
              <input className="form-input w-full mb-2" placeholder="Phone" value={form.primary_contact_phone || ''} onChange={(e) => setField('primary_contact_phone', e.target.value)} />
              <input className="form-input w-full" placeholder="Email" value={form.primary_contact_email || ''} onChange={(e) => setField('primary_contact_email', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Alternate contact</label>
              <input className="form-input w-full mb-2" placeholder="Name" value={form.alternate_contact_name || ''} onChange={(e) => setField('alternate_contact_name', e.target.value)} />
              <input className="form-input w-full" placeholder="Phone" value={form.alternate_contact_phone || ''} onChange={(e) => setField('alternate_contact_phone', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="form-label">Ship-to</label>
            <input className="form-input w-full mb-2" placeholder="Address line 1" value={form.ship_address_line1 || ''} onChange={(e) => setField('ship_address_line1', e.target.value)} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <input className="form-input" placeholder="City" value={form.ship_city || ''} onChange={(e) => setField('ship_city', e.target.value)} />
              <input className="form-input" placeholder="State" value={form.ship_state || ''} onChange={(e) => setField('ship_state', e.target.value)} />
              <input className="form-input" placeholder="ZIP" value={form.ship_zip || ''} onChange={(e) => setField('ship_zip', e.target.value)} />
              <input className="form-input" placeholder="Country" value={form.ship_country || ''} onChange={(e) => setField('ship_country', e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-gray-300">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!form.request_onsite_technician} onChange={(e) => setField('request_onsite_technician', e.target.checked)} />
              Onsite Dell tech
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!form.request_complete_care} onChange={(e) => setField('request_complete_care', e.target.checked)} />
              Complete Care
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!form.request_return_to_depot} onChange={(e) => setField('request_return_to_depot', e.target.checked)} />
              Return to depot
            </label>
          </div>

          <div>
            <label className="form-label">Evidence files (photos / logs)</label>
            <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.txt,.log,.xlsx,.xls" onChange={onPickFiles} className="text-sm text-gray-300" />
            {attachments.length > 0 && (
              <ul className="mt-2 text-xs text-gray-400 space-y-1">
                {attachments.map((a, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{a.filename}</span>
                    <button type="button" className="text-red-400" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-700 flex flex-wrap gap-2 justify-end sticky bottom-0 bg-gray-800">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => submit(true)} disabled={saving}>
            Save draft
          </button>
          <button type="button" className="btn btn-primary" onClick={() => submit(false)} disabled={saving}>
            {saving ? 'Saving…' : 'Submit / queue'}
          </button>
        </div>
      </div>
    </div>
  );
}
