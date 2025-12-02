
import * as fs from 'fs';
import * as path from 'path';
import * as zarr from 'zarrita';
import * as fflate from 'fflate';
import { Blosc } from 'numcodecs';

zarr.registry.set('blosc', () => Promise.resolve(Blosc));

// Polyfill File and Blob
class MockFile {
    constructor(buffer, name) {
        this.buffer = buffer;
        this.name = name;
    }
    async arrayBuffer() {
        return this.buffer;
    }
}

// ZipFileStore implementation (adapted from source)
class ZipFileStore {
    constructor(file) {
        this.file = file;
        this.entries = {};
    }

    async init() {
        const buffer = await this.file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);

        return new Promise((resolve, reject) => {
            fflate.unzip(uint8, (err, unzipped) => {
                if (err) return reject(err);
                this.entries = unzipped;
                // console.log('Zip entries:', Object.keys(this.entries));
                resolve();
            });
        });
    }

    get(key) {
        const normalizedKey = key.startsWith('/') ? key.slice(1) : key;
        const entry = this.entries[normalizedKey];
        return Promise.resolve(entry);
    }

    has(key) {
        const normalizedKey = key.startsWith('/') ? key.slice(1) : key;
        return Promise.resolve(normalizedKey in this.entries);
    }
}

async function run() {
    const filePath = path.join(process.cwd(), 'Reference', 'elevation_map.zarr.zip');
    console.log(`Reading ${filePath}...`);

    if (!fs.existsSync(filePath)) {
        console.error("File not found!");
        return;
    }

    const buffer = fs.readFileSync(filePath);
    const file = new MockFile(buffer, 'elevation_map.zarr.zip');
    const store = new ZipFileStore(file);

    console.log("Initializing store...");
    await store.init();

    const rootLocation = new zarr.Location(store);

    console.log("Opening group...");
    const root = await zarr.open(rootLocation, { kind: 'group' });

    // Try to open 'elevation' array
    console.log("Opening 'elevation' array...");
    try {
        const arr = await zarr.open(rootLocation.resolve('elevation'), { kind: 'array' });
        console.log("Array opened:", arr.shape, arr.dtype);

        // Try to read a chunk (0,0,0)
        // Shape is [1, 627, 957]
        // Chunk shape is [1, 314, 479]
        console.log("Reading slice [0, 0, 0]...");
        const res = await zarr.get(arr, [0, 0, 0]);
        console.log("Read success!");
        console.log("Data sample:", res.data.slice(0, 10));

        // Check for NaNs
        let nanCount = 0;
        for (let i = 0; i < res.data.length; i++) {
            if (isNaN(res.data[i])) nanCount++;
        }
        console.log(`NaN count in first pixel: ${nanCount}`);

    } catch (e) {
        console.error("Error reading array:", e.message);
        console.error(e.stack);
    }
}

run().catch(console.error);
