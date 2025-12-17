import * as THREE from 'three';

// Configurable constants for the BombCounter
const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 256;
const INITIAL_TIME = 40.0; // seconds
const FONT_SIZE_PX = 180;

export class BombCounter {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_WIDTH; // Wider canvas to fix stretching
    this.canvas.height = CANVAS_HEIGHT;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    // Counter state
    this.timeLeft = INITIAL_TIME; // default bomb time
    this.lastTime = Date.now();
    this.isRunning = true;
  }

  getTexture() {
    return this.texture;
  }

  reset(duration = INITIAL_TIME) {
    this.timeLeft = duration;
    this.lastTime = Date.now();
    this.isRunning = true;
    this.draw();
  }

  update() {
    if (!this.isRunning) {
      // Keep lastTime updated so we don't have a huge jump when we start
      this.lastTime = Date.now();
      return;
    }

    const now = Date.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    this.timeLeft -= dt;
    if (this.timeLeft < 0) {
      this.timeLeft = 0;
      this.isRunning = false;
    }

    this.draw();
  }

  draw() {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear background for transparency
    this.ctx.clearRect(0, 0, w, h);

    // Digital text glow effect
    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = '#ff0000';

  // Text settings
  // Increased font size to fill the screen
  this.ctx.font = `bold ${FONT_SIZE_PX}px "Courier New", monospace`;
    this.ctx.fillStyle = '#ff0000';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    // Format time: MM:SS:MS
    const minutes = Math.floor(this.timeLeft / 60);
    const seconds = Math.floor(this.timeLeft % 60);
    const ms = Math.floor((this.timeLeft % 1) * 100);

    const text = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;

    this.ctx.fillText(text, w / 2, h / 2);

    this.texture.needsUpdate = true;
  }
}
