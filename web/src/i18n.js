// Global i18n (Internationalization) System
// This module manages Portuguese and English translations for the entire application

const translations = {
  pt: {
    // Navigation and UI
    language: 'Idioma',
    start: 'COMEÇAR JOGO',
    startGame: '▶ COMEÇAR JOGO',

    // Guide Page
    guideTitle: 'KEEP TALKING AND NOBODY EXPLODES',
    guideSubtitle: 'Robot Bomb Defusal Game',
    controls: '🎮 Controlos',
    mouse: '🖱️ Rato:',
    rotateScene: 'Rodar a cena em volta',
    mouseWheel: '🔍 Roda do rato:',
    zoomInOut: 'Fazer zoom in/out',
    aboutGame: '📋 Sobre o Jogo',
    aboutGameDescription: 'Bem-vindo ao desafio de desarmamento de bombas! Nesta experiência imersiva com robô, controlarás um manipulador robótico para cortar fios de um módulo explosivo. A sequência e combinação de fios é crítica - um corte errado e tudo explode!',
    followRules: 'Segue atentamente as regras fornecidas abaixo para determinar qual fio deve ser cortado. Comunica com clareza, trabalha com precisão e... mantêm a calma!',
    wireGuide: '⚙️ GUIA DE FIOS',
    importantInfo: 'Informações Importantes',
    wireCount: 'O módulo de fios pode conter entre 3 a 6 fios',
    correctWire: 'Basta cortar o fio correto para desarmar o módulo',
    wireOrder: 'A ordem dos fios começa com o primeiro no topo',
    threeWires: '3 Fios',
    fourWires: '4 Fios',
    fiveWires: '5 Fios',
    sixWires: '6 Fios',
    tip: 'ℹ️ Dica:',
    tipText: 'Estuda atentamente o módulo antes de qualquer ação. Identifica cada fio pela cor e acompanha a sequência correta da regra correspondente.',
    goodLuck: 'Boa sorte, especialista em desarmamento!',

    // LLM Messages
    llmName: 'Agente LLM',
    statusWriting: 'a escrever...',
    analysisMsg: 'Analisei o módulo. Recomendo cortares o ',
    defaultReply: 'Ainda não sei. Tente perguntar outra coisa!',

    // Wire Colors
    colors: {
      red: 'vermelho',
      blue: 'azul',
      green: 'verde',
      yellow: 'amarelo',
      highlight_yellow: 'amarelo', // special case if needed, but simple map covers it
      black: 'preto',
      white: 'branco',
      purple: 'roxo',
      orange: 'laranja',
      gray: 'cinza',
      pink: 'rosa',
      cyan: 'ciano',
      magenta: 'magenta',
      lime: 'lima',
      teal: 'cerceta', // or verde-água
      indigo: 'índigo',
      violet: 'violeta',
      gold: 'dourado',
      silver: 'prateado',
      brown: 'marrom'
    }
  },
  en: {
    // Navigation and UI
    language: 'Language',
    start: 'START GAME',
    startGame: '▶ START GAME',

    // Guide Page
    guideTitle: 'KEEP TALKING AND NOBODY EXPLODES',
    guideSubtitle: 'Robot Bomb Defusal Game',
    controls: '🎮 Controls',
    mouse: '🖱️ Mouse:',
    rotateScene: 'Rotate the scene around',
    mouseWheel: '🔍 Mouse wheel:',
    zoomInOut: 'Zoom in/out',
    aboutGame: '📋 About the Game',
    aboutGameDescription: 'Welcome to the bomb defusal challenge! In this immersive robot experience, you will control a robotic manipulator to cut wires from an explosive module. The sequence and combination of wires is critical - one wrong cut and everything explodes!',
    followRules: 'Follow the rules provided below carefully to determine which wire should be cut. Communicate clearly, work with precision, and... stay calm!',
    wireGuide: '⚙️ WIRE GUIDE',
    importantInfo: 'Important Information',
    wireCount: 'The wire module may contain between 3 to 6 wires',
    correctWire: 'Only the correct wire needs to be cut to defuse the module',
    wireOrder: 'The order of wires starts with the first one at the top',
    threeWires: '3 Wires',
    fourWires: '4 Wires',
    fiveWires: '5 Wires',
    sixWires: '6 Wires',
    tip: 'ℹ️ Tip:',
    tipText: 'Study the module carefully before any action. Identify each wire by color and follow the correct rule sequence.',
    goodLuck: 'Good luck, defusal specialist!',

    // LLM Messages
    llmName: 'Agent LLM',
    statusWriting: 'writing...',
    analysisMsg: 'I\'ve analyzed the module. Recommend cutting ',
    defaultReply: 'I don\'t know about that yet. Try asking something else!',

    // Wire Colors
    colors: {
      red: 'red',
      blue: 'blue',
      green: 'green',
      yellow: 'yellow',
      black: 'black',
      white: 'white',
      purple: 'purple',
      orange: 'orange',
      gray: 'gray',
      pink: 'pink',
      cyan: 'cyan',
      magenta: 'magenta',
      lime: 'lime',
      teal: 'teal',
      indigo: 'indigo',
      violet: 'violet',
      gold: 'gold',
      silver: 'silver',
      brown: 'brown'
    }
  }
};

// Language manager
class LanguageManager {
  constructor() {
    this.currentLanguage = this.getStoredLanguage() || 'pt';
    this.initializeLanguage();
  }

  getStoredLanguage() {
    return localStorage.getItem('appLanguage');
  }

  setLanguage(lang) {
    if (translations[lang]) {
      this.currentLanguage = lang;
      localStorage.setItem('appLanguage', lang);
      this.notifyListeners();
    }
  }

  getCurrentLanguage() {
    return this.currentLanguage;
  }

  t(key) {
    const keys = key.split('.');
    let value = translations[this.currentLanguage];

    for (const k of keys) {
      if (value && value[k] !== undefined) {
        value = value[k];
      } else {
        return key; // Return key if path not found
      }
    }

    return value;
  }

  initializeLanguage() {
    this.setupLanguageToggle();
  }

  setupLanguageToggle() {
    // Listen for language toggle buttons anywhere in the app
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('lang-btn')) {
        const lang = e.target.getAttribute('data-lang');
        if (lang) {
          this.setLanguage(lang);
        }
      }
    });
  }

  onLanguageChange(callback) {
    if (!this.listeners) {
      this.listeners = [];
    }
    this.listeners.push(callback);
  }

  notifyListeners() {
    if (this.listeners) {
      this.listeners.forEach(callback => callback(this.currentLanguage));
    }
  }
}

// Export singleton instance
export const i18n = new LanguageManager();

// Helper function for dynamic translation
export function translate(key) {
  return i18n.t(key);
}

// Initialize language toggle UI globally
export function initializeLanguageUI() {
  const existingToggle = document.querySelector('.language-toggle');
  if (existingToggle) return; // Already initialized

  const toggle = document.createElement('div');
  toggle.className = 'language-toggle';
  toggle.innerHTML = `
    <button class="lang-btn ${i18n.currentLanguage === 'pt' ? 'active' : ''}" data-lang="pt">🇵🇹 PT</button>
    <button class="lang-btn ${i18n.currentLanguage === 'en' ? 'active' : ''}" data-lang="en">🇬🇧 EN</button>
  `;

  document.body.appendChild(toggle);
  updateLanguageUI();

  // Listen for language changes
  i18n.onLanguageChange(() => {
    updateLanguageUI();
  });
}

// Update all lang-btn active states
function updateLanguageUI() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    if (btn.getAttribute('data-lang') === i18n.currentLanguage) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}
