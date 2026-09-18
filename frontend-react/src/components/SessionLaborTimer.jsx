import { useEffect, useState } from 'react';
import { Pause, Play, Users } from 'lucide-react';
import api from '../services/api';

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * PM labor timer + crew count on an active session.
 */
export default function SessionLaborTimer({ session, onUpdated, showMessage, disabled = false }) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [crew, setCrew] = useState(1);
  const [busy, setBusy] = useState(false);
  const [baseActive, setBaseActive] = useState(0);
  const [startedAtMs, setStartedAtMs] = useState(null);

  useEffect(() => {
    if (!session) return;
    const active = Math.max(0, Number(session.active_seconds) || 0);
    const isRunning = Number(session.timer_running) === 1;
    setBaseActive(active);
    setRunning(isRunning);
    setCrew(Math.max(1, Number(session.crew_count) || 1));
    if (isRunning && session.timer_started_at) {
      const raw = String(session.timer_started_at);
      const iso = /T|Z/.test(raw) ? raw : raw.replace(' ', 'T') + 'Z';
      const t = new Date(iso).getTime();
      setStartedAtMs(Number.isNaN(t) ? Date.now() : t);
    } else {
      setStartedAtMs(null);
      setElapsed(active);
    }
  }, [
    session?.id,
    session?.active_seconds,
    session?.timer_running,
    session?.timer_started_at,
    session?.crew_count,
  ]);

  useEffect(() => {
    if (!running) return undefined;
    const tick = () => {
      const extra = startedAtMs ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)) : 0;
      setElapsed(baseActive + extra);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running, baseActive, startedAtMs]);

  const syncFromResponse = (res) => {
    if (!res?.success) return;
    onUpdated?.(res.session);
    setElapsed(res.elapsed_seconds || 0);
    setRunning(!!res.timer_running);
    setCrew(res.crew_count || 1);
    setBaseActive(Math.max(0, Number(res.session?.active_seconds) || 0));
    if (res.timer_running && res.session?.timer_started_at) {
      const raw = String(res.session.timer_started_at);
      const iso = /T|Z/.test(raw) ? raw : raw.replace(' ', 'T') + 'Z';
      setStartedAtMs(new Date(iso).getTime() || Date.now());
    } else {
      setStartedAtMs(null);
    }
  };

  const callTimer = async (action, extra = {}) => {
    if (!session?.id || disabled) return;
    setBusy(true);
    try {
      const res = await api.sessionTimer(session.id, { action, ...extra });
      if (res.success) syncFromResponse(res);
      else showMessage?.(res.error || 'Timer update failed', 'error');
    } catch (e) {
      showMessage?.(e?.message || 'Timer update failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!session || session.status === 'completed') {
    const doneSecs = Math.max(0, Number(session?.active_seconds) || 0);
    if (!session || doneSecs <= 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-gray-300">
        <span className="font-mono text-base text-gray-100">{formatClock(doneSecs)}</span>
        <span className="text-xs text-gray-500">
          Logged · crew {Math.max(1, Number(session.crew_count) || 1)} ·{' '}
          {((doneSecs * Math.max(1, Number(session.crew_count) || 1)) / 3600).toFixed(1)} person-hrs
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Labor</span>
      <span
        className={`font-mono text-lg tabular-nums ${running ? 'text-emerald-300' : 'text-gray-100'}`}
        title="Elapsed PM time"
      >
        {formatClock(elapsed)}
      </span>
      {running ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => callTimer('pause')}
        >
          <Pause className="h-3.5 w-3.5" aria-hidden />
          Pause
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => callTimer('start', { crew_count: crew })}
        >
          <Play className="h-3.5 w-3.5" aria-hidden />
          Start
        </button>
      )}
      <label className="ml-1 flex items-center gap-1.5 text-xs text-gray-400">
        <Users className="h-3.5 w-3.5" aria-hidden />
        Crew
        <input
          type="number"
          min={1}
          max={50}
          className="form-input !min-h-8 w-14 !px-2 !py-1 text-sm"
          value={crew}
          disabled={busy || disabled}
          onChange={(e) => setCrew(Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 1)))}
          onBlur={() => callTimer('set_crew', { crew_count: crew })}
        />
      </label>
      <span className="text-xs text-gray-500">
        {((elapsed * Math.max(1, crew)) / 3600).toFixed(1)} person-hrs
      </span>
    </div>
  );
}
