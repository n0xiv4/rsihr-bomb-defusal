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

  // Handle Autoplay Policy
  if (listener.context.state === 'suspended') {
    const resumeAudio = () => {
      listener.context.resume().then(() => {
        sound.play()
      })
      window.removeEventListener('click', resumeAudio)
      window.removeEventListener('keydown', resumeAudio)
    }
    window.addEventListener('click', resumeAudio)
    window.addEventListener('keydown', resumeAudio)
  } else {
    sound.play()
  }
})

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.5
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

// Create a two-column layout: left = 3D viewer, right = dummy LLM chat
const app = document.querySelector('#app')
app.innerHTML = `
  <div class="layout">
    <div id="viewer" class="viewer" aria-label="3D viewer"></div>
    <div id="llm" class="llm" aria-label="Chat with dummy LLM"></div>
  </div>
`

const viewer = document.getElementById('viewer')
viewer.appendChild(renderer.domElement)

// Initialize the dummy LLM UI in the right panel
initLLM({ container: document.getElementById('llm') })

// Environment Setup (Better Lighting)
const pmremGenerator = new THREE.PMREMGenerator(renderer)
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture

// Controls
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.minDistance = 1
controls.maxDistance = 10
controls.target.set(0, 0.5, 0)

// Grid Helper
const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222)
scene.add(gridHelper)

// Counter Logic
const bombCounter = new BombCounter()

// Load Model
const loader = new GLTFLoader()
loader.load(
  '/bomb_test.glb',
  (gltf) => {
    const model = gltf.scene

    // Find the screen mesh and apply texture
    // NOTE: You must name the mesh 'CounterDisplay' in Blender!
    const displayMesh = model.getObjectByName('counter')
    if (displayMesh) {
      displayMesh.material = new THREE.MeshStandardMaterial({
        map: bombCounter.getTexture(),
        transparent: true, // Enable transparency
        emissive: 0xff0000, // Make it glow red
        emissiveMap: bombCounter.getTexture(),
        emissiveIntensity: 2,
        roughness: 0.2,
        metalness: 0.8
      })
      // If the texture is flipped, uncomment this:
      // bombCounter.getTexture().flipY = false;
    } else {
      console.warn('Could not find mesh named "counter". Did you name it correctly in Blender?')
    }

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true

        // Hide broken cables initially
        if (child.name.endsWith('_d')) {
          child.visible = false
        }
      }
    })

    // Center the model
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    model.position.sub(center) // Center at 0,0,0

    // Scale up
    model.scale.set(5, 5, 5)

    model.position.y += (box.max.y - box.min.y) / 2 * 5 // Move up so it sits on grid, accounting for scale

    scene.add(model)

    // Optional: Auto-rotate
    // model.rotation.y = Math.PI / 4
  },
  (xhr) => {
    console.log((xhr.loaded / xhr.total * 100) + '% loaded')
  },
  (error) => {
    console.error('An error happened', error)
  }
)

// Handle Resize
// Handle Resize
const resizeObserver = new ResizeObserver(() => {
  const rect = viewer.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) {
    camera.aspect = rect.width / rect.height
    camera.updateProjectionMatrix()
    renderer.setSize(rect.width, rect.height)
  }
})
resizeObserver.observe(viewer)

// Interaction Handlers
function onPointerMove(event) {
  const rect = viewer.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
}

function onClick(event) {
  if (hoveredObject) {
    const cableName = hoveredObject.name
    const brokenCableName = cableName + '_d'
    const brokenCable = scene.getObjectByName(brokenCableName)

    if (brokenCable) {
      // Restore material before hiding
      if (originalMaterials.has(hoveredObject.uuid)) {
        hoveredObject.material = originalMaterials.get(hoveredObject.uuid)
        originalMaterials.delete(hoveredObject.uuid)
      }

      hoveredObject.visible = false
      brokenCable.visible = true
      hoveredObject = null
    }
  }
}

viewer.addEventListener('mousemove', onPointerMove)
viewer.addEventListener('click', onClick)

// Animation Loop
// Animation Loop
function animate() {
  requestAnimationFrame(animate)

  // Update counter
  bombCounter.update()

  controls.update()

  // Raycasting for hover effect
  raycaster.setFromCamera(pointer, camera)
  const intersects = raycaster.intersectObjects(scene.children, true)

  let foundCable = false
  for (const intersect of intersects) {
    const object = intersect.object
    // Check if it's a visible cable and NOT a broken one
    if (object.visible && object.name.startsWith('cable') && !object.name.endsWith('_d')) {
      foundCable = true
      viewer.style.cursor = 'pointer'

      if (hoveredObject !== object) {
        // Restore previous hovered object
        if (hoveredObject && originalMaterials.has(hoveredObject.uuid)) {
          hoveredObject.material = originalMaterials.get(hoveredObject.uuid)
          originalMaterials.delete(hoveredObject.uuid)
        }

        hoveredObject = object

        // Store original material
        originalMaterials.set(object.uuid, object.material)

        // Apply highlight
        const highlightMaterial = object.material.clone()
        highlightMaterial.emissive.setHex(0xaaaaaa)
        highlightMaterial.emissiveIntensity = 0.5
        object.material = highlightMaterial
      }
      break // Only highlight the first/closest cable
    }
  }

  // If no cable hit, reset hovered object
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
