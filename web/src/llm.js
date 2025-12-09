// Simple client-side "dummy LLM" chat UI
// Exports: initLLM({ container })

class DummyLLM {
  // Simulate a response from an LLM. Returns a Promise<string>
  respond(prompt) {
    // Very small "intelligence" — canned heuristics and transforms
    return new Promise((resolve) => {
      const lower = (prompt || '').toLowerCase()
      let reply = "I don't know about that yet. Try asking something else!"

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

function createBubble(text, isUser = false) {
  const el = document.createElement('div')
  el.className = `chat-bubble ${isUser ? 'user' : 'bot'}`
  el.textContent = text
  return el
}

export function initLLM({ container }) {
  if (!container) return

  // Build minimal chat UI WITHOUT text input. The LLM will "think" on startup for 5s.
  container.innerHTML = ''
  container.classList.add('llm-container')

  const header = document.createElement('div')
  header.className = 'llm-header'
  header.textContent = 'Bombs LLM'

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

  // Start with a visible thinking demo for 5 seconds
  const typing = createTyping()
  messages.appendChild(typing)
  messages.scrollTop = messages.scrollHeight

  setTimeout(() => {
    typing.remove()
    messages.appendChild(createBubble('Done thinking — hello! I examined the 3D model mentally for a moment.', false))
    messages.scrollTop = messages.scrollHeight
  }, 5000)

  // Expose a small API on the container so other code can trigger thinking later if desired
  container.startThinking = (ms = 3000, doneMessage = 'Done thinking.') => {
    const t2 = createTyping()
    messages.appendChild(t2)
    messages.scrollTop = messages.scrollHeight
    setTimeout(() => {
      t2.remove()
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
      prefix.style.fontSize = '0.8em';
      prefix.style.marginBottom = '4px';
      prefix.textContent = sender;
      bubble.prepend(prefix);
    }
    messages.appendChild(bubble)
    messages.scrollTop = messages.scrollHeight
  }
}

// No default export
