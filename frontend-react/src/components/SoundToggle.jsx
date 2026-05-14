import { useState } from 'react';
import soundSystem from '../utils/sounds';

export default function SoundToggle({ compact = false }) {
  const [enabled, setEnabled] = useState(soundSystem.enabled);

  const handleToggle = () => {
    const newState = soundSystem.toggle();
    setEnabled(newState);
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleToggle}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#3d3d5c] bg-[#252542] text-lg shadow-sm transition-all hover:border-blue-500/50 hover:bg-[#2f2f4d] hover:ring-2 hover:ring-blue-500/30 focus:outline-none focus:ring-2 focus:ring-blue-500"
        title={enabled ? 'Sounds on — click to mute' : 'Sounds off — click to enable'}
      >
        <span aria-hidden>{enabled ? '🔊' : '🔇'}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#3d3d5c] bg-[#1b1b2f] px-3 py-2 text-sm font-medium text-gray-200 shadow-sm transition-all hover:border-blue-500/50 hover:bg-[#252542] hover:ring-2 hover:ring-blue-500/30 focus:outline-none focus:ring-2 focus:ring-blue-500"
      title={enabled ? 'Disable sounds' : 'Enable sounds'}
    >
      <span className="text-lg leading-none" aria-hidden>
        {enabled ? '🔊' : '🔇'}
      </span>
      <span>{enabled ? 'Sounds on' : 'Sounds off'}</span>
    </button>
  );
}
