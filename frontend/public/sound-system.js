/**
 * Sound System for Cabinet PM App
 * Handles success and error sound feedback
 */

class SoundSystem {
    constructor() {
        this.sounds = {
            success: new Audio('/assets/success_bell-6776.mp3'),
            error: new Audio('/assets/windows-error-sound-effect-35894.mp3')
        };

        this.enabled = this.getSoundPreference();
        this.volume = 0.7; // Default volume (70%)
        
        this.init();
    }

    init() {
        // Set default volume for all sounds
        Object.keys(this.sounds).forEach(key => {
            this.sounds[key].volume = this.volume;
            this.sounds[key].preload = 'auto';
        });

        // Wait for DOM to be ready before creating toggle
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.createSoundToggle();
            });
        } else {
            this.createSoundToggle();
        }
    }

    createSoundToggle() {
        // Check if toggle already exists or body is not ready
        if (document.querySelector('.sound-toggle') || !document.body) return;

        const toggle = document.createElement('div');
        toggle.className = 'sound-toggle';
        toggle.innerHTML = `
            <button class="sound-btn" title="${this.enabled ? 'Disable Sounds' : 'Enable Sounds'}">
                ${this.enabled ? '🔊' : '🔇'}
            </button>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .sound-toggle {
                position: fixed;
                top: 80px;
                right: 20px;
                z-index: 999;
            }
            
            .sound-btn {
                background: var(--bg-primary);
                border: 2px solid var(--border-primary);
                border-radius: 50%;
                width: 45px;
                height: 45px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 18px;
                box-shadow: var(--shadow-md);
                transition: all 0.3s ease;
            }
            
            .sound-btn:hover {
                transform: scale(1.1);
                box-shadow: var(--shadow-lg);
            }
        `;
        document.head.appendChild(style);

        // Add event listener
        toggle.querySelector('.sound-btn').addEventListener('click', () => {
            this.toggleSound();
        });

        document.body.appendChild(toggle);
    }

    toggleSound() {
        this.enabled = !this.enabled;
        this.saveSoundPreference(this.enabled);
        
        const btn = document.querySelector('.sound-btn');
        if (btn) {
            btn.innerHTML = this.enabled ? '🔊' : '🔇';
            btn.title = this.enabled ? 'Disable Sounds' : 'Enable Sounds';
        }

        // Play a test sound when enabling
        if (this.enabled) {
            this.playSuccess();
        }
    }

    playSuccess() {
        if (!this.enabled) return;
        
        try {
            // Reset the audio to beginning in case it's already playing
            this.sounds.success.currentTime = 0;
            this.sounds.success.play().catch(error => {
                console.log('Could not play success sound:', error);
            });
        } catch (error) {
            console.log('Error playing success sound:', error);
        }
    }

    playError() {
        if (!this.enabled) return;
        
        try {
            // Reset the audio to beginning in case it's already playing
            this.sounds.error.currentTime = 0;
            this.sounds.error.play().catch(error => {
                console.log('Could not play error sound:', error);
            });
        } catch (error) {
            console.log('Error playing error sound:', error);
        }
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume)); // Clamp between 0 and 1
        Object.keys(this.sounds).forEach(key => {
            this.sounds[key].volume = this.volume;
        });
    }

    getSoundPreference() {
        const saved = localStorage.getItem('cabinet-pm-sounds-enabled');
        return saved !== null ? JSON.parse(saved) : true; // Default to enabled
    }

    saveSoundPreference(enabled) {
        localStorage.setItem('cabinet-pm-sounds-enabled', JSON.stringify(enabled));
    }

    // Public methods for easy integration
    success() {
        this.playSuccess();
    }

    error() {
        this.playError();
    }

    enable() {
        this.enabled = true;
        this.saveSoundPreference(true);
        this.updateToggleUI();
    }

    disable() {
        this.enabled = false;
        this.saveSoundPreference(false);
        this.updateToggleUI();
    }

    updateToggleUI() {
        const btn = document.querySelector('.sound-btn');
        if (btn) {
            btn.innerHTML = this.enabled ? '🔊' : '🔇';
            btn.title = this.enabled ? 'Disable Sounds' : 'Enable Sounds';
        }
    }
}

// Create global sound system instance
window.soundSystem = new SoundSystem();

// Helper functions for easy use throughout the app
window.playSuccessSound = () => window.soundSystem.success();
window.playErrorSound = () => window.soundSystem.error();

// Export for module use if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SoundSystem;
} 