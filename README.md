# Particle System Pro

A high-performance, interactive 3D particle simulation controlled by hand gestures and real-time audio. Built with Three.js and MediaPipe.

**Live Demo:** [https://particle-thingy.vercel.app](https://particle-thingy.vercel.app)

## Key Features

* **High-Performance Particles:** Renders 30,000 to 80,000 particles with glow effects.
* **Hand Tracking Control:** Touchless interface using computer vision.
* **Audio Visualization:** Particles react physically to Bass, Mid, and High frequencies.
* **Custom Shapes:** Import any .obj model to reshape the galaxy.
* **Mobile Optimized:** Automatically adjusts performance settings for mobile devices.

## Gesture Controls

| Hand | Gesture | Action |
| --- | --- | --- |
| **Right Hand** | Move / Tilt | **Rotate** the galaxy physics. |
| **Left Hand** | Pinch (Thumb + Index) | **Gather** particles (Analog control). |
| **Left Hand** | Fist (Clench) | **Lock** current gather state (allows hand rest). |
| **Left Hand** | Open Hand | **Reset** / Scatter particles. |
| **Both Hands** | 10 Fingers Open | **Zoom Mode** (Move hands apart to zoom in). |

## How to Run

**Note:** This project requires a local server due to browser security policies regarding Camera and Audio access.

1. Open the project folder in **VS Code**.
2. Install the **Live Server** extension.
3. Right-click `index.html` and select **"Open with Live Server"**.
4. Allow Camera and Microphone permissions when prompted.

## Tech Stack

* **Three.js** (WebGL Rendering)
* **MediaPipe Hands** (Computer Vision)
* **Web Audio API** (Spectrum Analysis)
* **GLSL Shaders** (Custom particle physics & coloring)
