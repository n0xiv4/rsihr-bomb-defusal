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

// Dash Server URL
const DASH_SERVER = 'http://localhost:5000';

function callDash(endpoint, body = {}) {
  fetch(`${DASH_SERVER}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(err => console.warn(`Dash ${endpoint} failed:`, err)); // Warn but don't break game
}

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
        try { sfx.stop(); } catch (e) { }
        audioPlayers.get(type)?.delete(sfx);
      };
      // There's no ended event on THREE.Audio; poll state via setTimeout as fallback
      setTimeout(onEnded, (buffer.duration || 1) * 1000 + 200);
    }

    return sfx;
  };

  if (soundContext.state === 'suspended') {
    const resumeAndPlay = () => {
      soundContext.resume().then(() => play()).catch(() => { });
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
    try { sfx.stop(); } catch (e) { }
    try { sfx.disconnect && sfx.disconnect(); } catch (e) { }
    set.delete(sfx);
  }
  audioPlayers.delete(type);
}

// --- GAME STATE MANAGEMENT ---
let gameConfig = null;
let currentRoundIndex = 0;
let allRounds = [];
let bombModel = null;
let materialCache = {}; // Cache all materials by name for easy lookup
let isRoundActive = false;
let countdownInterval = null;
let suggestionTimeout = null;
let currentCableMapping = {}; // Maps logical cable (cable1, cable2) to physical position
let currentColorMapping = {}; // Maps physical cable position to color

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
  loader.load('/bomb.glb', (gltf) => {
    bombModel = gltf.scene;

    // Cache all materials by name for easy lookup
    materialCache = {};
    console.log('=== AVAILABLE MATERIALS IN GLB ===');
    const availableMaterials = new Set();
    bombModel.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach(mat => {
          if (mat && mat.name) {
            availableMaterials.add(mat.name);
            materialCache[mat.name] = mat; // Store in cache
          }
        });
      }
    });
    console.log('Materials:', Array.from(availableMaterials).sort());
    console.log('Material cache created with', Object.keys(materialCache).length, 'materials');
    console.log('=================================');

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
  const wireColors = roundData.wireColors || [];
  const keyboardType = roundData.keyboardType || 'normal';

  // Update body material based on keyboard type
  const bodyMaterialName = keyboardType === 'roman' ? 'c4_roman_variant' : 'c4_normal_variant';
  console.log(`Looking for body material: ${bodyMaterialName}`);

  const bodyMesh = bombModel.getObjectByName('body');
  if (bodyMesh && bodyMesh.isMesh) {
    // Use material cache for instant lookup
    const foundBodyMaterial = materialCache[bodyMaterialName];

    if (foundBodyMaterial) {
      bodyMesh.material = foundBodyMaterial;
      console.log(`✓ Applied body material: ${bodyMaterialName}`);
    } else {
      console.error(`❌ Body material not found in GLB: "${bodyMaterialName}"`);
      console.error(`⚠️  The GLB file is missing this material!`);
      console.error(`📝 You need to add "${bodyMaterialName}" to your GLB file in Blender`);
      // Log all available materials for debugging
      const availableMaterials = new Set();
      bombModel.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach(mat => {
            if (mat && mat.name) availableMaterials.add(mat.name);
          });
        }
      });
      console.log('Available body materials:', Array.from(availableMaterials).filter(m => m.includes('c4')));
      console.warn('⚠️  Keeping previous material as fallback');
    }
  } else {
    console.warn('Body mesh not found');
  }

  // Use sequential cable positions (cable1, cable2, cable3, etc.) based on wireCount
  // No random selection - always use the first N cables
  const selectedPositions = [];
  for (let i = 1; i <= wiresToShow && i <= 6; i++) {
    selectedPositions.push(i);
  }

  // Create mapping: logical cable (cable1, cable2, etc.) -> physical position
  // and also colorIndex -> cablePosition
  currentCableMapping = {};
  currentColorMapping = {};
  for (let i = 0; i < wireColors.length && i < selectedPositions.length; i++) {
    const cablePos = selectedPositions[i];
    const color = wireColors[i];
    const logicalCable = `cable${i + 1}`;

    currentCableMapping[logicalCable] = `cable${cablePos}`;
    currentColorMapping[cablePos] = color;
  }

  console.log(`Round setup - wireCount: ${wiresToShow}, wireColors:`, wireColors);
  console.log('Selected positions:', selectedPositions);
  console.log('Color mapping:', currentColorMapping);

  bombModel.traverse((child) => {
    if (child.name.startsWith('cable') && !child.name.endsWith('_d')) {
      const num = parseInt(child.name.replace('cable', ''));
      if (!isNaN(num)) {
        // Check if this cable position should be visible
        const shouldShow = selectedPositions.includes(num);
        child.visible = shouldShow;

        if (shouldShow && currentColorMapping[num]) {
          const color = currentColorMapping[num];
          // Determine material name: color_cable for cable1-4, color_cable2 for cable5-6
          const materialSuffix = (num >= 5) ? '_cable2' : '_cable';
          const materialName = color + materialSuffix;

          console.log(`Cable${num}: Looking for material "${materialName}" for color "${color}"`);

          // Use material cache for instant lookup
          const foundMaterial = materialCache[materialName];

          if (foundMaterial) {
            child.material = foundMaterial;
            console.log(`Cable${num}: ✓ Applied material "${materialName}"`);
          } else {
            console.error(`Cable${num}: ✗ Material NOT FOUND: "${materialName}"`);
            console.log('Available cable materials:', Object.keys(materialCache).filter(m => m.includes('cable')).sort());
          }
        }

        if (originalMaterials.has(child.uuid)) {
          originalMaterials.delete(child.uuid);
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

    // Map logical suggestion to physical cable
    const llmPhysicalSuggestion = currentCableMapping[roundData.llmSuggestion] || roundData.llmSuggestion;

    // Get the color name for the suggested cable
    const physicalCableNum = parseInt(llmPhysicalSuggestion.replace('cable', ''));
    const colorName = currentColorMapping[physicalCableNum] || 'unknown';

    llmContainer.addMessage(`I've analyzed the module. Recommend cutting ${colorName}.`, "LLM");
  }, 12000);

  // Dash Logic
  callDash('think');

  // Schedule Dash Suggestion (slightly delayed from LLM or same time)
  setTimeout(() => {
    if (!isRoundActive) return;

    // Map logical suggestion to physical cable for Dash (who points/moves)
    const dashLogicalSuggestion = roundData.dashSuggestion;
    const dashPhysicalSuggestion = currentCableMapping[dashLogicalSuggestion];

    // Get color for Dash
    if (dashPhysicalSuggestion) {
      const dashCableNum = parseInt(dashPhysicalSuggestion.replace('cable', ''));
      const dashColor = currentColorMapping[dashCableNum];

      console.log(`Dash Suggests: ${dashLogicalSuggestion} -> ${dashPhysicalSuggestion} (${dashColor})`);
      if (dashColor) {
        callDash('suggest', { color: dashColor });
      }
    }
  }, 10000); // 10 seconds in
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
  stopSound('timer');
  playSound(isWin ? 'defused' : 'explosion');

  // Trigger Dash Reaction
  if (gameConfig && roundIdx >= 0) { // React even in tutorial? User didn't specify, assuming yes or from round 1.
    const roundData = allRounds[roundIdx];
    const correctWire = roundData.correctWire;
    const dashSuggestion = roundData.dashSuggestion;

    // "se ele errou/a bomba explodiu feel_sad"
    // "se deu a resposta certa e a pessoa escolheu essa, celebrate"

    const dashWasRight = dashSuggestion === correctWire;

    if (isWin && dashWasRight) {
      callDash('celebrate');
    } else {
      // Exploded OR Dash gave wrong advice
      callDash('sad');
    }
  }

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
    const cableName = hoveredObject.name; // Physical cable name (e.g., "cable3")
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
      // Map the logical correctWire to physical cable position
      const correctPhysicalCable = currentCableMapping[roundData.correctWire];
      const isCorrect = cableName === correctPhysicalCable;

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
