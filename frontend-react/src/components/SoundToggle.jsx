import { useState } from 'react';
import soundSystem from '../utils/sounds';

export default function SoundToggle() {
  const [enabled, setEnabled] = useState(soundSystem.enabled);

  const handleToggle = () => {
    const newState = soundSystem.toggle();
    setEnabled(newState);
  };

  return (
    <button
      onClick={handleToggle}
      className="fixed top-20 right-4 z-50 bg-gray-800 border-2 border-gray-600 rounded-full w-12 h-12 flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
      title={enabled ? 'Disable Sounds' : 'Enable Sounds'}
    >
      <span className="text-xl">{enabled ? '🔊' : '🔇'}</span>
    </button>
  );
}
