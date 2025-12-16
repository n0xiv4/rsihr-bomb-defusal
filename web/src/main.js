import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// ... (previous imports)

import { BombCounter } from './counter.js'
import { initLLM } from './llm.js'
import { logRoundData } from './firebase.js'

// ... (previous imports)

// Scene setup
// Scene setup
const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0x111111, 0.02)

// Interaction globals
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2(-100, -100) // Start off-screen
let hoveredObject = null
const originalMaterials = new Map()

// Camera setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.set(0, 2, 0)
camera.lookAt(0, 0, 0)

// Audio Listener
const listener = new THREE.AudioListener()
camera.add(listener)

// Note: Theme audio is played only on the guide page. Here we keep an audio listener
// for in-game SFX only.

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.5
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

// DOM Setup
const app = document.querySelector('#app')
app.innerHTML = `
  <div class="layout">
    <div id="viewer" class="viewer" aria-label="3D viewer"></div>
    <div id="llm" class="llm" aria-label="Chat with dummy LLM"></div>
  </div>
  
  <!-- RESULT OVERLAY -->
  <div id="gameOverlay" class="game-overlay">
    <div class="overlay-content">
      <h1 id="overlayTitle" class="overlay-title"></h1>
      <div id="overlayRound" class="overlay-round"></div>
      <div class="overlay-timer">
        Next round in: <span id="overlayTimerCount" class="timer-count">10</span>
      </div>
    </div>
  </div>
`
const viewer = document.getElementById('viewer')
viewer.appendChild(renderer.domElement)
const llmContainer = document.getElementById('llm')
initLLM({ container: llmContainer })

// Overlay Elements
const overlay = document.getElementById('gameOverlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayRound = document.getElementById('overlayRound');
const overlayTimerCount = document.getElementById('overlayTimerCount');

// Environment
const pmremGenerator = new THREE.PMREMGenerator(renderer)
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture

// Controls
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.minDistance = 1
controls.maxDistance = 10
controls.target.set(0, 0.5, 0)

const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222)
scene.add(gridHelper)

const bombCounter = new BombCounter()

// Sounds
const soundContext = listener.context;
const audioBuffers = {
  defused: null,
  explosion: null,
  theme: null,
  timer: null
};

// Keep track of playing THREE.Audio instances by type so we can stop them
const audioPlayers = new Map(); // type -> Set(THREE.Audio)

// Preload SFX
const sfxLoader = new THREE.AudioLoader();
sfxLoader.load('/audio/defused_bomb.mp3', (buffer) => { audioBuffers.defused = buffer; });
sfxLoader.load('/audio/bomb_explosion.mp3', (buffer) => { audioBuffers.explosion = buffer; });
sfxLoader.load('/audio/csgo_main_theme.mp3', (buffer) => { audioBuffers.theme = buffer; });
sfxLoader.load('/audio/bomb_time.mp3', (buffer) => { audioBuffers.timer = buffer; });

/**
 * Play a buffered SFX and keep a reference so it can be stopped later.
 * Returns the created THREE.Audio instance (or null if buffer missing).
 */
function playSound(type, opts = {}) {
  const { volume = 0.5, loop = false } = opts;
  const buffer = audioBuffers[type];
  if (!buffer) return null;

  const play = () => {
    const sfx = new THREE.Audio(listener);
    sfx.setBuffer(buffer);
    sfx.setLoop(loop);
    sfx.setVolume(volume);
    try { sfx.play(); } catch (e) { /* ignore play errors */ }

    // Track instance
    if (!audioPlayers.has(type)) audioPlayers.set(type, new Set());
    audioPlayers.get(type).add(sfx);

    // Remove when ended (for non-looping sounds)
    if (!loop) {
      const onEnded = () => {
        try { sfx.stop(); } catch (e) {}
        audioPlayers.get(type)?.delete(sfx);
      };
      // There's no ended event on THREE.Audio; poll state via setTimeout as fallback
      setTimeout(onEnded, (buffer.duration || 1) * 1000 + 200);
    }

    return sfx;
  };

  if (soundContext.state === 'suspended') {
    const resumeAndPlay = () => {
      soundContext.resume().then(() => play()).catch(() => {});
      window.removeEventListener('click', resumeAndPlay);
      window.removeEventListener('keydown', resumeAndPlay);
    };
    window.addEventListener('click', resumeAndPlay);
    window.addEventListener('keydown', resumeAndPlay);
    return null;
  } else {
    return play();
  }
}

function stopSound(type) {
  const set = audioPlayers.get(type);
  if (!set) return;
  for (const sfx of Array.from(set)) {
    try { sfx.stop(); } catch (e) {}
    try { sfx.disconnect && sfx.disconnect(); } catch (e) {}
    set.delete(sfx);
  }
  audioPlayers.delete(type);
}

// --- GAME STATE MANAGEMENT ---
let gameConfig = null;
let currentRoundIndex = 0;
let allRounds = [];
let bombModel = null;
let isRoundActive = false;
let countdownInterval = null;
let suggestionTimeout = null;

// Load Configuration
const urlParams = new URLSearchParams(window.location.search);
const conditionKey = urlParams.get('condition') === 'b' ? 'b' : 'a';

fetch('/config/rounds.json')
  .then(res => res.json())
  .then(config => {
    gameConfig = config;
    gameConfig.conditionName = conditionKey === 'b' ? 'LLM Fails More' : 'Dash Fails More';

    // Flatten and Process Rounds
    const processRound = (r) => ({
      ...r,
      llmSuggestion: r.suggestions[conditionKey].llm,
      dashSuggestion: r.suggestions[conditionKey].dash
    });

    allRounds = [
      ...config.tutorial.map(processRound),
      ...config.rounds.map(processRound)
    ];

    console.log(`Loaded Condition: ${gameConfig.conditionName}`);
    loadModel();
  })
  .catch(err => console.error("Failed to load config:", err));


function loadModel() {
  const loader = new GLTFLoader()
  loader.load('/bomb_test.glb', (gltf) => {
    bombModel = gltf.scene;

    // Setup Counter Mesh
    const displayMesh = bombModel.getObjectByName('counter');
    if (displayMesh) {
      displayMesh.material = new THREE.MeshStandardMaterial({
        map: bombCounter.getTexture(),
        transparent: true,
        emissive: 0xff0000,
        emissiveMap: bombCounter.getTexture(),
        emissiveIntensity: 2,
        roughness: 0.2,
        metalness: 0.8
      });
    }

    bombModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.name.endsWith('_d')) child.visible = false;
      }
    });

    const box = new THREE.Box3().setFromObject(bombModel);
    const center = box.getCenter(new THREE.Vector3());
    bombModel.position.sub(center);
    bombModel.scale.set(5, 5, 5);
    bombModel.position.y += (box.max.y - box.min.y) / 2 * 5;

    scene.add(bombModel);

    // START GAME
    startRound(0);
  });
}

function startRound(index) {
  if (index >= allRounds.length) {
    window.location.href = '/thanks.html';
    return;
  }

  currentRoundIndex = index;
  const roundData = allRounds[index];
  isRoundActive = true;

  // Timer: 40s (handled by default in reset)
  bombCounter.reset();
  // Ensure any previous timer SFX is stopped, then play round-start looping timer sound
  stopSound('timer');
  playSound('timer', { volume: 0.6, loop: true });

  // Hide Overlay
  overlay.classList.remove('visible');

  // Setup Cables
  const wiresToShow = roundData.wireCount;

  bombModel.traverse((child) => {
    if (child.name.startsWith('cable') && !child.name.endsWith('_d')) {
      const num = parseInt(child.name.replace('cable', ''));
      if (!isNaN(num)) {
        child.visible = num <= wiresToShow;
        if (originalMaterials.has(child.uuid)) {
          child.material = originalMaterials.get(child.uuid);
        }
      }
      const brokenName = child.name + '_d';
      const broken = bombModel.getObjectByName(brokenName);
      if (broken) broken.visible = false;
    }
  });

  // Clear previous messages and show thinking
  llmContainer.clearMessages();
  llmContainer.showThinking();

  // Provide Suggestions 
  if (suggestionTimeout) clearTimeout(suggestionTimeout);
  suggestionTimeout = setTimeout(() => {
    llmContainer.hideThinking();
    if (!isRoundActive) return;
    llmContainer.addMessage(`I've analyzed the module. Recommend cutting ${roundData.llmSuggestion}.`, "LLM");
  }, 25000);

  // Dash Logic: NO LONGER IN CHAT, just internal logic if visuals were needed.
  // We keep it running but silent as requested.
}

function showResultOverlay(result, roundIdx, cutCableName = null) {
  isRoundActive = false;
  bombCounter.isRunning = false;

  const isWin = result === 'win';
  const roundLabel = roundIdx < 2 ? `Tutorial ${roundIdx + 1}` : `Round ${roundIdx - 1}`;

  overlayTitle.textContent = isWin ? 'BOMB DEFUSED' : 'EXPLOSION DETECTED';
  overlayTitle.className = 'overlay-title ' + (isWin ? 'win' : 'loss');

  overlayRound.textContent = `${roundLabel} Complete`;

  // Play Sound
  // Stop the round timer sound (if playing) then play result SFX
  stopSound('timer');
  playSound(isWin ? 'defused' : 'explosion');

  // Log Data (Skip first 2 tutorial rounds)
  if (gameConfig && roundIdx >= 2) {
    const roundData = allRounds[roundIdx];
    const timeTaken = 40 - bombCounter.timeLeft; // Assuming 40s start time

    const sessionData = {
      roundIndex: roundIdx,
      condition: gameConfig.conditionName || 'unknown',
      correctCable: roundData.correctWire,
      cableChosen: cutCableName,
      outcome: result, // 'win', 'loss', 'timeout'
      timeTaken: parseFloat(timeTaken.toFixed(3)),
      llmSuggestion: roundData.llmSuggestion,
      dashSuggestion: roundData.dashSuggestion || 'none'
    };

    logRoundData(sessionData);
  }

  overlay.classList.add('visible');

  // Countdown
  let seconds = 10;
  overlayTimerCount.textContent = seconds;

  if (countdownInterval) clearInterval(countdownInterval);
  if (suggestionTimeout) clearTimeout(suggestionTimeout);
  llmContainer.hideThinking();

  countdownInterval = setInterval(() => {
    seconds--;
    overlayTimerCount.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(countdownInterval);
      startRound(roundIdx + 1);
    }
  }, 1000);
}

// Interaction
function onPointerMove(event) {
  const rect = viewer.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
}

function onClick(event) {
  if (!isRoundActive || !gameConfig) return;

  if (hoveredObject) {
    const cableName = hoveredObject.name;
    const brokenCableName = cableName + '_d';
    const brokenCable = scene.getObjectByName(brokenCableName);

    if (brokenCable) {
      // Cut Animation
      if (originalMaterials.has(hoveredObject.uuid)) {
        hoveredObject.material = originalMaterials.get(hoveredObject.uuid);
        originalMaterials.delete(hoveredObject.uuid);
      }
      hoveredObject.visible = false;
      brokenCable.visible = true;
      hoveredObject = null;

      // Validate Cut
      const roundData = allRounds[currentRoundIndex];
      const isCorrect = cableName === roundData.correctWire;

      showResultOverlay(isCorrect ? 'win' : 'loss', currentRoundIndex, cableName);
    }
  }
}

viewer.addEventListener('mousemove', onPointerMove)
viewer.addEventListener('click', onClick)

// Render Loop
const resizeObserver = new ResizeObserver(() => {
  const rect = viewer.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) {
    camera.aspect = rect.width / rect.height
    camera.updateProjectionMatrix()
    renderer.setSize(rect.width, rect.height)
  }
})
resizeObserver.observe(viewer)

function animate() {
  requestAnimationFrame(animate)
  bombCounter.update()
  controls.update()

  // Check for Time limit
  if (isRoundActive && bombCounter.timeLeft <= 0) {
    showResultOverlay('timeout', currentRoundIndex, null);
  }

  // Raycasting
  raycaster.setFromCamera(pointer, camera)
  const intersects = raycaster.intersectObjects(scene.children, true)
  let foundCable = false

  if (isRoundActive) {
    for (const intersect of intersects) {
      const object = intersect.object
      if (object.visible && object.name.startsWith('cable') && !object.name.endsWith('_d')) {
        foundCable = true
        viewer.style.cursor = 'pointer'
        if (hoveredObject !== object) {
          if (hoveredObject && originalMaterials.has(hoveredObject.uuid)) {
            hoveredObject.material = originalMaterials.get(hoveredObject.uuid)
            originalMaterials.delete(hoveredObject.uuid)
          }
          hoveredObject = object
          originalMaterials.set(object.uuid, object.material)
          const highlightMaterial = object.material.clone()
          highlightMaterial.emissive.setHex(0xaaaaaa)
          highlightMaterial.emissiveIntensity = 0.5
          object.material = highlightMaterial
        }
        break
      }
    }
  }

  if (!foundCable) {
    viewer.style.cursor = 'default'
    if (hoveredObject) {
      if (originalMaterials.has(hoveredObject.uuid)) {
        hoveredObject.material = originalMaterials.get(hoveredObject.uuid)
        originalMaterials.delete(hoveredObject.uuid)
      }
      hoveredObject = null
    }
  }

  renderer.render(scene, camera)
}
animate()
