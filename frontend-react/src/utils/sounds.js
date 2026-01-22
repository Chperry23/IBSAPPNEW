/**
 * Sound System for Cabinet PM App
 * Handles success and error sound feedback
 */

class SoundSystem {
  constructor() {
    this.sounds = {
      success: new Audio('/success_bell-6776.mp3'),
      error: new Audio('/windows-error-sound-effect-35894.mp3'),
    };

    this.enabled = this.getSoundPreference();
    this.volume = 0.7;

    // Set volume for all sounds
    Object.keys(this.sounds).forEach((key) => {
      this.sounds[key].volume = this.volume;
      this.sounds[key].preload = 'auto';
    });
  }

  playSuccess() {
    if (!this.enabled) return;
    try {
      this.sounds.success.currentTime = 0;
      this.sounds.success.play().catch((error) => {
        console.log('Could not play success sound:', error);
      });
    } catch (error) {
      console.log('Error playing success sound:', error);
    }
  }

  playError() {
    if (!this.enabled) return;
    try {
      this.sounds.error.currentTime = 0;
      this.sounds.error.play().catch((error) => {
        console.log('Could not play error sound:', error);
      });
    } catch (error) {
      console.log('Error playing error sound:', error);
    }
  }

  getSoundPreference() {
    const saved = localStorage.getItem('cabinet-pm-sounds-enabled');
    return saved !== null ? JSON.parse(saved) : true;
  }

  saveSoundPreference(enabled) {
    localStorage.setItem('cabinet-pm-sounds-enabled', JSON.stringify(enabled));
  }

  toggle() {
    this.enabled = !this.enabled;
    this.saveSoundPreference(this.enabled);
    if (this.enabled) {
      this.playSuccess();
    }
    return this.enabled;
  }
}

// Create global sound system instance
const soundSystem = new SoundSystem();

export default soundSystem;
