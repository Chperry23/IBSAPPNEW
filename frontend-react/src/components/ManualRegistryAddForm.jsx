import { useState } from 'react';

const WORKSTATION_TYPES = [
  'Local Operator',
  'Local Application',
  'Local Professional Plus',
  'Local Pro',
  'Local Safety',
  'Remote Operator',
  'Remote ProfessionalPlus',
  'Remote Application',
  'Remote Safety',
  'Batch Historian',
  'OPC Server',
  'VRTX Chassis (Virtual)',
  'Host (Virtual)',
  'File Witness (Virtual)',
  'Non-DV Node',
  'Workstation',
];

const CONTROLLER_TYPES = ['Controller', 'CIOC', 'CSLS', 'SZ Controller', 'Charms Smart Logic Solver', 'DeltaV EIOC'];

export default function ManualRegistryAddForm({ category, customerId, onAdded, onCancel }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => defaultForm(category));

  function defaultForm(cat) {
    if (cat === 'workstation') {
      return { name: '', type: 'Host (Virtual)', model: '', os_name: '', software_revision: '', redundant: 'No', dell_service_tag_number: '' };
    }
    if (cat === 'controller') {
      return { name: '', model: '', software_revision: '', hardware_revision: '', serial_number: '', redundant: 'No' };
    }
    if (cat === 'switch') {
      return { name: '', model: '', software_revision: '', hardware_revision: '', serial_number: '' };
    }
    return { name: '', model: '', software_revision: '', hardware_revision: '', serial_number: '', redundant: 'No' };
  }

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/system-registry/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ category, ...form, name: form.name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to add');
        return;
      }
      setForm(defaultForm(category));
      onAdded?.(data);
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const label = { workstation: 'Workstation', controller: 'Controller', switch: 'Smart Switch', cioc: 'Charms I/O Card' }[category];

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-blue-500/30 bg-blue-950/20 p-4">
      <h4 className="mb-3 text-sm font-semibold text-blue-200">Add {label}</h4>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <input
          type="text"
          placeholder="Name *"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          className="form-input text-sm"
          required
        />
        {category === 'workstation' && (
          <>
            <select value={form.type} onChange={(e) => set('type', e.target.value)} className="form-select text-sm">
              {WORKSTATION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input type="text" placeholder="Model (e.g. VE3008)" value={form.model} onChange={(e) => set('model', e.target.value)} className="form-input text-sm" />
            <input type="text" placeholder="OS name" value={form.os_name} onChange={(e) => set('os_name', e.target.value)} className="form-input text-sm" />
            <input type="text" placeholder="Software revision" value={form.software_revision} onChange={(e) => set('software_revision', e.target.value)} className="form-input text-sm" />
            <input type="text" placeholder="Service tag / serial" value={form.dell_service_tag_number} onChange={(e) => set('dell_service_tag_number', e.target.value)} className="form-input text-sm" />
            <select value={form.redundant} onChange={(e) => set('redundant', e.target.value)} className="form-select text-sm">
              <option value="No">Redundant: No</option>
              <option value="Yes">Redundant: Yes</option>
            </select>
          </>
        )}
        {category === 'controller' && (
          <>
            <input type="text" placeholder="Model" value={form.model} onChange={(e) => set('model', e.target.value)} className="form-input text-sm" />
            <input type="text" placeholder="Software revision" value={form.software_revision} onChange={(e) => set('software_revision', e.target.value)} className="form-input text-sm" />
            <input type="text" placeholder="Hardware revision" value={form.hardware_revision} onChange={(e) => set('hardware_revision', e.target.value)} className="form-input text-sm" />
            <input type="text" placeholder="Serial number" value={form.serial_number} onChange={(e) => set('serial_number', e.target.value)} className="form-input text-sm" />
            <select value={form.redundant} onChange={(e) => set('redundant', e.target.value)} className="form-select text-sm">
              <option value="No">Redundant: No</option>
              <option value="Yes">Redundant: Yes</option>
            </select>
          </>
        )}
        {category === 'switch' && (
          <>
            <input type="text" placeholder="Model" value={form.model} onChange={(e) => set('model', e.target.value)} className="form-input text-sm" />
            <input type="text" placeholder="Software revision" value={form.software_revision} onChange={(e) => set('software_revision', e.target.value)} className="form-input text-sm" />
            <input type="text" placeholder="Hardware revision" value={form.hardware_revision} onChange={(e) => set('hardware_revision', e.target.value)} className="form-input text-sm" />
            <input type="text" placeholder="Serial number" value={form.serial_number} onChange={(e) => set('serial_number', e.target.value)} className="form-input text-sm" />
          </>
        )}
        {category === 'cioc' && (
          <>
            <input type="text" placeholder="Model" value={form.model} onChange={(e) => set('model', e.target.value)} className="form-input text-sm" />
            <input type="text" placeholder="Software revision" value={form.software_revision} onChange={(e) => set('software_revision', e.target.value)} className="form-input text-sm" />
            <input type="text" placeholder="Hardware revision" value={form.hardware_revision} onChange={(e) => set('hardware_revision', e.target.value)} className="form-input text-sm" />
            <input type="text" placeholder="Serial number" value={form.serial_number} onChange={(e) => set('serial_number', e.target.value)} className="form-input text-sm" />
            <select value={form.redundant} onChange={(e) => set('redundant', e.target.value)} className="form-select text-sm">
              <option value="No">Redundant: No</option>
              <option value="Yes">Redundant: Yes</option>
            </select>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? 'Saving…' : `Add ${label}`}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export { WORKSTATION_TYPES, CONTROLLER_TYPES };
