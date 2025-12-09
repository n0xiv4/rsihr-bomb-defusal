import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// ... (previous imports)

import { BombCounter } from './counter.js'
import { initLLM } from './llm.js'

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
camera.position.set(0, 1, 3)

// Audio Listener
const listener = new THREE.AudioListener()
camera.add(listener)

// Global Audio source
const sound = new THREE.Audio(listener)
const audioLoader = new THREE.AudioLoader()
audioLoader.load('/audio/csgo_main_theme.mp3', function (buffer) {
  sound.setBuffer(buffer)
  sound.setLoop(true)
  sound.setVolume(0.05)
  if (listener.context.state === 'suspended') {
    const resumeAudio = () => { listener.context.resume().then(() => sound.play()); window.removeEventListener('click', resumeAudio); window.removeEventListener('keydown', resumeAudio); }
    window.addEventListener('click', resumeAudio)
    window.addEventListener('keydown', resumeAudio)
  } else {
    sound.play()
  }
})

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
  explosion: null
};

// Preload SFX
const sfxLoader = new THREE.AudioLoader();
sfxLoader.load('/audio/defused_bomb.mp3', (buffer) => { audioBuffers.defused = buffer; });
sfxLoader.load('/audio/bomb_explosion.mp3', (buffer) => { audioBuffers.explosion = buffer; });

function playSound(type) {
  if (audioBuffers[type] && soundContext.state === 'running') {
    const sfx = new THREE.Audio(listener);
    sfx.setBuffer(audioBuffers[type]);
    sfx.setVolume(0.5);
    sfx.play();
  }
}

// --- GAME STATE MANAGEMENT ---
let gameConfig = null;
let currentRoundIndex = 0;
let allRounds = [];
let bombModel = null;
let isRoundActive = false;
let countdownInterval = null;

// Load Configuration
const urlParams = new URLSearchParams(window.location.search);
const condition = urlParams.get('condition') === 'b' ? 'condition_b.json' : 'condition_a.json';

fetch(`/config/${condition}`)
  .then(res => res.json())
  .then(config => {
    gameConfig = config;
    allRounds = [...config.tutorial, ...config.rounds];
    console.log(`Loaded Condition: ${config.conditionName}`);
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
    llmContainer.addMessage("Simulation Complete. Thank you for participating!", "System");
    isRoundActive = false;
    return;
  }

  currentRoundIndex = index;
  const roundData = allRounds[index];
  isRoundActive = true;

  // Timer: 40s (handled by default in reset)
  bombCounter.reset();

  // Hide Overlay
  overlay.classList.remove('visible');

  // Clear Chat for cleanliness per round?? No, history is good.
  const roundLabel = index < 2 ? `TUTORIAL ${index + 1}` : `ROUND ${index - 1}`;
  llmContainer.addMessage(`--- ${roundLabel} START ---`, "System");

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

  // Provide Suggestions 
  setTimeout(() => {
    if (!isRoundActive) return;
    llmContainer.addMessage(`I've analyzed the module. Recommend cutting ${roundData.llmSuggestion}.`, "LLM");
  }, 1000);

  // Dash Logic: NO LONGER IN CHAT, just internal logic if visuals were needed.
  // We keep it running but silent as requested.
}

function showResultOverlay(result, roundIdx) {
  isRoundActive = false;
  bombCounter.isRunning = false;

  const isWin = result === 'win';
  const roundLabel = roundIdx < 2 ? `Tutorial ${roundIdx + 1}` : `Round ${roundIdx - 1}`;

  overlayTitle.textContent = isWin ? 'BOMB DEFUSED' : 'EXPLOSION DETECTED';
  overlayTitle.className = 'overlay-title ' + (isWin ? 'win' : 'loss');

  overlayRound.textContent = `${roundLabel} Complete`;

  // Play Sound
  playSound(isWin ? 'defused' : 'explosion');

  overlay.classList.add('visible');

  // Countdown
  let seconds = 10;
  overlayTimerCount.textContent = seconds;

  if (countdownInterval) clearInterval(countdownInterval);

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

      showResultOverlay(isCorrect ? 'win' : 'loss', currentRoundIndex);
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
    showResultOverlay('timeout', currentRoundIndex);
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
