# RSIHR Bomb Defusal Experiment - Web Client

This directory contains the web-based simulation and user interface for the Human-Robot Interaction experiment.

## Project Overview

The experiment investigates human trust in automated systems by presenting users with a complex bomb defusal task. Users are assisted by two agents:
1.  **Dash Robot** (Physical Agent, simulated or teleoperated)
2.  **LLM Assistant** (Digital Agent, simulated chat interface)

The experiment is run in two conditions to vary the reliability of these agents.

## Getting Started

### Prerequisites
- Node.js (Latest LTS recommended)

### Installation
1.  Navigate to this directory:
    ```bash
    cd web
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

### Running the Experiment
Start the local development server:
```bash
npm run dev
```
Open `http://localhost:5173/` (or the port shown in the terminal) to access the **Admin Console**.

## Experiment Conditions

You can launch specific conditions directly from the Admin Console (`index.html`):

-   **Condition A (Reliable LLM)**:
    -   URL: `/bomb.html?condition=a`
    -   Config: `public/config/condition_a.json`
    -   The Robot (Dash) is unreliable. The LLM is mostly correct.

-   **Condition B (Reliable Robot)**:
    -   URL: `/bomb.html?condition=b`
    -   Config: `public/config/condition_b.json`
    -   The Robot (Dash) is reliable. The LLM halluncinates frequently.

## Configuration

Game rounds and agent behavior are defined in JSON files located in `public/config/`.
-   `tutorial`: Array of introductory rounds.
-   `rounds`: Array of main experiment rounds.
-   `correctWire`: The wire that successfully defuses the bomb.
-   `llmSuggestion`: The wire suggested by the LLM.

## Architecture

-   **Frontend**: Vanilla JavaScript with Three.js for 3D rendering.
-   **Bundler**: Vite.
-   **3D Assets**: GLB models in `public/`.
