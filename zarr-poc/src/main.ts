import * as zarr from 'zarrita';
import { ZipFileStore } from './zipStore';

// DOM Elements
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const canvas = document.getElementById('renderer') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;
const playPauseBtn = document.getElementById('playPause') as HTMLButtonElement;
const timeSlider = document.getElementById('timeSlider') as HTMLInputElement;
const timeLabel = document.getElementById('timeLabel') as HTMLSpanElement;
const fpsSpan = document.getElementById('fps') as HTMLSpanElement;
const memorySpan = document.getElementById('memory') as HTMLSpanElement;
const chunkTimeSpan = document.getElementById('chunkTime') as HTMLSpanElement;

// State
let isPlaying = false;
let currentFrame = 0;
let totalFrames = 0;
let array: zarr.Array<zarr.DataType> | null = null;
let lastFrameTime = 0;
let frameCount = 0;
let lastFpsUpdate = 0;
let animationId: number | null = null;

// Color Map (Simple Grayscale to Viridis-ish)
function getColor(value: number): [number, number, number] {
    // Normalize 0-1 (assuming illumination is 0-1 or similar)
    // Adjust based on actual data range
    const v = Math.max(0, Math.min(1, value));
    return [v * 255, v * 255, v * 255];
}

// Image Buffer
let imageData: ImageData | null = null;

async function loadFile(file: File) {
    console.log('Loading file:', file.name);

    try {
        const store = new ZipFileStore(file);
        await store.init();
        console.log('Zip store initialized');

        // Wrap store in Location to allow resolving paths
        const rootLocation = new zarr.Location(store);
        const root = await zarr.open(rootLocation, { kind: 'group' });
        console.log('Root group:', root);

        // Find the first array variable
        try {
            array = await zarr.open(rootLocation.resolve('illumination'), { kind: 'array' });
        } catch (e) {
            console.warn('Could not open "illumination", trying to guess...');
            throw e;
        }

        if (!array) throw new Error('No array found');

        console.log('Array opened:', array);
        console.log('Shape:', array.shape);
        console.log('Chunks:', array.chunks);

        // Setup dimensions
        const [time, height, width] = array.shape;
        totalFrames = time;

        canvas.width = width;
        canvas.height = height;
        imageData = ctx.createImageData(width, height);

        // Update UI
        timeSlider.max = (totalFrames - 1).toString();

        // Render first frame
        renderFrame(0);

    } catch (err) {
        console.error('Error loading file:', err);
        alert('Failed to load Zarr file. See console.');
    }
}

async function renderFrame(frameIndex: number) {
    if (!array || !imageData) return;

    const startTime = performance.now();

    try {
        // Read chunk: [time, y, x]
        // We want the whole spatial slice for one time step
        // slice(frameIndex, frameIndex + 1)

        // Zarrita get returns a nested array or TypedArray depending on selection
        // We want [1, height, width]
        const { data } = await zarr.get(array, [frameIndex, null, null]);

        // Data is likely a TypedArray (Float32Array)
        // It might be flattened or nested depending on zarrita version/usage
        // Usually it's a flat TypedArray with stride

        // Assuming flat Float32Array for [1, height, width]
        const floatData = data as Float32Array;
        const pixels = imageData.data;

        // Simple pixel mapping
        // This loop is the bottleneck in JS, usually fast enough for 512x512
        // For 4k, we'd use WebGL
        for (let i = 0; i < floatData.length; i++) {
            const val = floatData[i];
            const offset = i * 4;
            // Simple grayscale
            const c = Math.floor(val * 255); // Assuming 0-1 range
            pixels[offset] = c;
            pixels[offset + 1] = c;
            pixels[offset + 2] = c;
            pixels[offset + 3] = 255;
        }

        ctx.putImageData(imageData, 0, 0);

        const endTime = performance.now();
        chunkTimeSpan.textContent = (endTime - startTime).toFixed(1);

    } catch (err) {
        console.error('Render error:', err);
    }
}

// Animation Loop
function loop(timestamp: number) {
    if (!isPlaying) return;

    // Throttle? No, go as fast as possible for PoC
    // Or sync to refresh rate

    renderFrame(currentFrame);

    // Update UI
    timeSlider.value = currentFrame.toString();
    timeLabel.textContent = currentFrame.toString();

    // Next frame
    currentFrame = (currentFrame + 1) % totalFrames;

    // FPS Calculation
    frameCount++;
    if (timestamp - lastFpsUpdate > 1000) {
        fpsSpan.textContent = Math.round(frameCount * 1000 / (timestamp - lastFpsUpdate)).toString();
        lastFpsUpdate = timestamp;
        frameCount = 0;

        // Memory (Chrome only)
        if ((performance as any).memory) {
            memorySpan.textContent = Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024).toString();
        }
    }

    animationId = requestAnimationFrame(loop);
}

// Event Listeners
fileInput.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) loadFile(file);
});

playPauseBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';
    if (isPlaying) {
        lastFpsUpdate = performance.now();
        loop(performance.now());
    } else if (animationId) {
        cancelAnimationFrame(animationId);
    }
});

timeSlider.addEventListener('input', (e) => {
    currentFrame = parseInt((e.target as HTMLInputElement).value);
    timeLabel.textContent = currentFrame.toString();
    if (!isPlaying) renderFrame(currentFrame);
});
