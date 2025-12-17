// Exports: initLLM({ container })

import robotAvatar from './robot.svg'
import { i18n } from './i18n.js'

class DummyLLM {
  // Simulate a response from an LLM. Returns a Promise<string>
  respond(prompt) {
    // Very small "intelligence" — canned heuristics and transforms
    return new Promise((resolve) => {
      const lower = (prompt || '').toLowerCase()
      let reply = i18n.t('defaultReply')

      if (!prompt || !prompt.trim()) {
        reply = 'Please type a message.'
      } else if (lower.includes('hello') || lower.includes('hi')) {
        reply = 'Hello! I\'m your local dummy LLM. I can echo, summarize, or reverse text.'
      } else if (lower.startsWith('echo ')) {
        reply = prompt.slice(5)
      } else if (lower.startsWith('reverse ')) {
        reply = prompt.slice(8).split('').reverse().join('')
      } else if (lower.startsWith('summary ') || lower.startsWith('summarize ')) {
        const body = prompt.split(' ').slice(1).join(' ')
        reply = body.split('.').slice(0, 2).join('.').trim() || body
      } else if (lower.includes('bomb')) {
        reply = "I see you have a bomb viewer. Nice 3D model — you can rotate and zoom it."
      } else {
        // Default: echo back with a tiny change
        reply = `You said: "${prompt}"`
      }

      // Simulate thinking time proportional to message length
      const delay = Math.min(1500 + prompt.length * 20, 2500)
      setTimeout(() => resolve(reply), delay)
    })
  }
}

function highlightColors(text) {
  const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'black', 'white', 'gray', 'pink', 'cyan', 'magenta', 'lime', 'teal', 'indigo', 'violet', 'gold', 'silver', 'brown'];
  const regex = new RegExp(`\\b(${colors.join('|')})\\b`, 'gi');
  return text.replace(regex, (match) => {
    // Use a pill style for maximum clarity
    const colorKey = match.toLowerCase();
    // Get translated name
    const translatedColor = i18n.t(`colors.${colorKey}`) || match;

    // Determine contrast text color
    const isDark = ['black', 'blue', 'purple', 'indigo', 'brown', 'red', 'green'].includes(colorKey);
    const textColor = isDark ? '#fff' : '#000';

    return `<span style="
      background-color: ${colorKey}; 
      color: ${textColor}; 
      padding: 2px 8px; 
      border-radius: 6px; 
      font-weight: bold; 
      box-shadow: 0 1px 3px rgba(0,0,0,0.4);
      display: inline-block;
      margin: 0 4px;
      text-transform: uppercase;
      font-size: 0.9em;
      border: 1px solid rgba(255,255,255,0.3);
      vertical-align: middle;
    ">${translatedColor}</span>`;
  });
}

function createBubble(text, isUser = false) {
  const el = document.createElement('div')
  el.className = `chat-bubble ${isUser ? 'user' : 'bot'}`
  // Use innerHTML to allow color highlighting spans
  // Simple escape for HTML tags to prevent XSS (basic)
  let safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  // Re-enable our specific spans (hacky but works for this controlled environment)
  // Actually, better to highlight AFTER escaping.
  el.innerHTML = highlightColors(safeText);

  // Check if we effectively un-escaped our own spans or if highlightColors generates safe HTML.
  // highlightColors returns <span ...>text</span>. The text inside is from the original string.
  // If the color name was "red", it is safe.

  return el
}

export function initLLM({ container }) {
  if (!container) return

  // Build minimal chat UI WITHOUT text input. The LLM will "think" on startup for 5s.
  container.innerHTML = ''
  container.classList.add('llm-container')

  const header = document.createElement('div')
  header.className = 'llm-header'

  const avatarImg = document.createElement('img')
  avatarImg.src = robotAvatar
  avatarImg.className = 'llm-avatar'
  avatarImg.alt = 'Robot Avatar'

  const headerInfo = document.createElement('div')
  headerInfo.className = 'llm-header-info'

  const titleText = document.createElement('div')
  titleText.className = 'llm-title'
  titleText.textContent = i18n.t('llmName')

  const statusText = document.createElement('div')
  statusText.className = 'llm-status'
  statusText.style.display = 'none' // Hidden by default
  statusText.textContent = i18n.t('statusWriting')

  headerInfo.appendChild(titleText)
  headerInfo.appendChild(statusText)

  header.appendChild(avatarImg)
  header.appendChild(headerInfo)

  const messages = document.createElement('div')
  messages.className = 'chat-messages'

  container.appendChild(header)
  container.appendChild(messages)

  // Create a typing element with animated dots
  function createTyping() {
    const t = document.createElement('div')
    t.className = 'typing typing-dots'
    t.setAttribute('aria-live', 'polite')
    // three dots
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span')
      dot.className = 'dot'
      t.appendChild(dot)
    }
    return t
  }

  // Expose a small API on the container so other code can trigger thinking later if desired
  container.startThinking = (ms = 3000, doneMessage = 'Done thinking.') => {
    container.showThinking() // Show status and dots
    setTimeout(() => {
      container.hideThinking()
      messages.appendChild(createBubble(doneMessage, false))
      messages.scrollTop = messages.scrollHeight
    }, ms)
  }

  container.addMessage = (text, sender = 'LLM') => {
    const bubble = createBubble(text, false)
    if (sender !== 'LLM') {
      bubble.classList.add('sender-' + sender.toLowerCase().replace(/\s+/g, '-'));
      const prefix = document.createElement('strong');
      prefix.style.display = 'block';
      prefix.style.fontSize = '0.7em'; // Smaller prefix
      prefix.style.marginBottom = '2px';
      prefix.style.opacity = '0.8';
      prefix.textContent = sender;
      bubble.prepend(prefix);
    }
    messages.appendChild(bubble)
    messages.scrollTop = messages.scrollHeight
  }

  container.clearMessages = () => {
    messages.innerHTML = ''
  }

  let thinkingEl = null
  container.showThinking = () => {
    statusText.style.display = 'block' // Show "writing..."
    if (thinkingEl) return
    thinkingEl = createTyping()
    messages.appendChild(thinkingEl)
    messages.scrollTop = messages.scrollHeight
  }

  container.hideThinking = () => {
    statusText.style.display = 'none' // Hide "writing..."
    if (thinkingEl) {
      thinkingEl.remove()
      thinkingEl = null
    }
  }

  // Listen for language changes to update static text
  i18n.onLanguageChange(() => {
    titleText.textContent = i18n.t('llmName')
    statusText.textContent = i18n.t('statusWriting')
  })
}

// No default export
