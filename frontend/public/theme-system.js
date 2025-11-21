/**
 * Advanced Theme System for Cabinet PM App
 * Provides beautiful theme switching with persistence
 */

class ThemeSystem {
    constructor() {
        this.themes = {
            light: {
                name: 'Light Mode',
                icon: '☀️',
                preview: '#3b82f6'
            },
            dark: {
                name: 'Dark Mode',
                icon: '🌙',
                preview: '#1e293b'
            },
            ocean: {
                name: 'Blue Ocean',
                icon: '🌊',
                preview: '#06b6d4'
            },
            forest: {
                name: 'Forest Green',
                icon: '🌲',
                preview: '#22c55e'
            },
            sunset: {
                name: 'Sunset Orange',
                icon: '🌅',
                preview: '#f97316'
            },
            purple: {
                name: 'Purple Night',
                icon: '🌌',
                preview: '#a855f7'
            },
            rose: {
                name: 'Rose Pink',
                icon: '🌸',
                preview: '#f43f5e'
            },
            paydirt: {
                name: 'Pay Dirt',
                icon: '💰',
                preview: '#d97706'
            }
        };

        this.currentTheme = this.getStoredTheme() || 'light';
        this.init();
    }

    init() {
        this.createThemeSelector();
        this.applyTheme(this.currentTheme);
        this.setupEventListeners();
        this.addAnimations();
    }

    createThemeSelector() {
        // Remove existing selector if present
        const existing = document.querySelector('.theme-selector');
        if (existing) {
            existing.remove();
        }

        const selector = document.createElement('div');
        selector.className = 'theme-selector';
        selector.innerHTML = `
            <div class="theme-toggle" title="Change Theme">
                ${this.themes[this.currentTheme].icon}
            </div>
            <div class="theme-dropdown">
                ${Object.entries(this.themes).map(([key, theme]) => `
                    <div class="theme-option ${key === this.currentTheme ? 'active' : ''}" data-theme="${key}">
                        <div class="theme-preview" style="background-color: ${theme.preview}"></div>
                        <span class="theme-name">${theme.name}</span>
                        <span class="theme-icon">${theme.icon}</span>
                    </div>
                `).join('')}
            </div>
        `;

        document.body.appendChild(selector);
    }

    setupEventListeners() {
        const toggle = document.querySelector('.theme-toggle');
        const dropdown = document.querySelector('.theme-dropdown');
        const options = document.querySelectorAll('.theme-option');

        // Toggle dropdown
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.theme-selector')) {
                dropdown.classList.remove('show');
            }
        });

        // Theme selection
        options.forEach(option => {
            option.addEventListener('click', (e) => {
                const theme = e.currentTarget.dataset.theme;
                this.switchTheme(theme);
                dropdown.classList.remove('show');
            });
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                dropdown.classList.remove('show');
            }
        });
    }

    switchTheme(themeName) {
        if (!this.themes[themeName]) return;

        // Add transition class for smooth switching
        document.body.classList.add('theme-transitioning');
        
        setTimeout(() => {
            this.currentTheme = themeName;
            this.applyTheme(themeName);
            this.updateSelector();
            this.storeTheme(themeName);
            
            // Remove transition class
            setTimeout(() => {
                document.body.classList.remove('theme-transitioning');
            }, 300);
        }, 50);

        // Show theme change notification
        this.showThemeNotification(this.themes[themeName]);
    }

    applyTheme(themeName) {
        // Remove all theme attributes
        Object.keys(this.themes).forEach(theme => {
            document.documentElement.removeAttribute(`data-theme`);
        });

        // Apply new theme
        if (themeName !== 'light') {
            document.documentElement.setAttribute('data-theme', themeName);
        }

        // Update meta theme color for mobile browsers
        this.updateMetaThemeColor(themeName);
    }

    updateSelector() {
        const toggle = document.querySelector('.theme-toggle');
        const options = document.querySelectorAll('.theme-option');

        if (toggle) {
            toggle.textContent = this.themes[this.currentTheme].icon;
            toggle.title = `Current theme: ${this.themes[this.currentTheme].name}`;
        }

        options.forEach(option => {
            option.classList.toggle('active', option.dataset.theme === this.currentTheme);
        });
    }

    updateMetaThemeColor(themeName) {
        let themeColor = '#3b82f6'; // Default light theme color
        
        const themeColors = {
            light: '#3b82f6',
            dark: '#1e293b',
            ocean: '#06b6d4',
            forest: '#22c55e',
            sunset: '#f97316',
            purple: '#a855f7',
            rose: '#f43f5e',
            paydirt: '#d97706'
        };

        themeColor = themeColors[themeName] || themeColor;

        // Update or create meta theme-color tag
        let metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (!metaThemeColor) {
            metaThemeColor = document.createElement('meta');
            metaThemeColor.name = 'theme-color';
            document.head.appendChild(metaThemeColor);
        }
        metaThemeColor.content = themeColor;
    }

    showThemeNotification(theme) {
        // Remove existing notification
        const existing = document.querySelector('.theme-notification');
        if (existing) {
            existing.remove();
        }

        const notification = document.createElement('div');
        notification.className = 'theme-notification';
        notification.innerHTML = `
            <div class="theme-notification-content">
                <span class="theme-notification-icon">${theme.icon}</span>
                <span class="theme-notification-text">Switched to ${theme.name}</span>
            </div>
        `;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        // Remove after delay
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 2000);
    }

    addAnimations() {
        // Add CSS for theme transitions and notifications
        const style = document.createElement('style');
        style.textContent = `
            /* Theme transition */
            .theme-transitioning * {
                transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease !important;
            }

            /* Theme notification */
            .theme-notification {
                position: fixed;
                top: 80px;
                right: 20px;
                z-index: 1001;
                opacity: 0;
                transform: translateX(100%);
                transition: all 0.3s ease;
            }

            .theme-notification.show {
                opacity: 1;
                transform: translateX(0);
            }

            .theme-notification-content {
                background: var(--bg-primary);
                border: 2px solid var(--border-primary);
                border-radius: 12px;
                padding: 12px 16px;
                box-shadow: var(--shadow-lg);
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 500;
                color: var(--text-primary);
                min-width: 180px;
            }

            .theme-notification-icon {
                font-size: 18px;
            }

            .theme-notification-text {
                font-size: 14px;
            }

            /* Enhanced theme selector animations */
            .theme-selector .theme-toggle {
                transform-origin: center;
            }

            .theme-selector .theme-toggle:active {
                transform: scale(0.95);
            }

            .theme-option {
                position: relative;
                overflow: hidden;
            }

            .theme-option::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                transition: left 0.5s ease;
            }

            .theme-option:hover::before {
                left: 100%;
            }

            .theme-preview {
                transition: transform 0.2s ease;
            }

            .theme-option:hover .theme-preview {
                transform: scale(1.1);
            }

            /* Mobile responsiveness */
            @media (max-width: 768px) {
                .theme-selector {
                    top: 10px !important;
                    right: 10px !important;
                }

                .theme-toggle {
                    width: 44px !important;
                    height: 44px !important;
                    font-size: 18px !important;
                }

                .theme-dropdown {
                    min-width: 180px !important;
                    right: 0 !important;
                }

                .theme-notification {
                    top: 70px;
                    right: 10px;
                    left: 10px;
                }

                .theme-notification-content {
                    justify-content: center;
                }
            }
        `;

        document.head.appendChild(style);
    }

    getStoredTheme() {
        try {
            return localStorage.getItem('cabinet-pm-theme');
        } catch (e) {
            console.warn('LocalStorage not available for theme persistence');
            return null;
        }
    }

    storeTheme(themeName) {
        try {
            localStorage.setItem('cabinet-pm-theme', themeName);
        } catch (e) {
            console.warn('Could not store theme preference');
        }
    }

    // Public API methods
    getCurrentTheme() {
        return this.currentTheme;
    }

    getAvailableThemes() {
        return { ...this.themes };
    }

    setTheme(themeName) {
        if (this.themes[themeName]) {
            this.switchTheme(themeName);
        }
    }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme system
    window.themeSystem = new ThemeSystem();

    // Add theme system to global scope for debugging
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('🎨 Theme System initialized!');
        console.log('Available themes:', Object.keys(window.themeSystem.getAvailableThemes()));
        console.log('Current theme:', window.themeSystem.getCurrentTheme());
        console.log('Use themeSystem.setTheme("themeName") to change themes programmatically');
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeSystem;
} 