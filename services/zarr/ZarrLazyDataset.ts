import * as zarr from 'zarrita';
import { ILazyDataset, SliceData, globalSliceCache } from '../LazyDataset';
import { ZipFileStore } from './ZipFileStore';

export class ZarrLazyDataset implements ILazyDataset {
    private store: ZipFileStore;
    private array: zarr.Array<zarr.DataType> | null = null;
    private fileId: string;
    private rootLocation: zarr.Location<zarr.Readable>;

    private variableName: string = 'illumination';
    private is2D: boolean = false;

    constructor(file: File) {
        this.fileId = file.name;
        this.store = new ZipFileStore(file);
        this.rootLocation = new zarr.Location(this.store);
    }

    async init(): Promise<void> {
        await this.store.init();

        // Open root group
        const root = await zarr.open(this.rootLocation, { kind: 'group' });

        // Dynamic detection of array
        const keys = this.store.keys();
        const potentialArrays = keys
            .filter(k => k.endsWith('.zarray'))
            .map(k => k.replace('/.zarray', '').replace('.zarray', ''));

        console.log('Potential Zarr arrays:', potentialArrays);

        let selectedArrayName: string | null = null;
        let selectedArray: zarr.Array<zarr.DataType> | null = null;

        // 1. Try "illumination" specifically first
        if (potentialArrays.includes('illumination')) {
            try {
                const arr = await zarr.open(this.rootLocation.resolve('illumination'), { kind: 'array' });
                if (arr.shape.length === 3 || arr.shape.length === 2) {
                    selectedArrayName = 'illumination';
                    selectedArray = arr;
                }
            } catch (e) { }
        }

        // 2. If not found, look for any 3D array
        if (!selectedArray) {
            for (const name of potentialArrays) {
                try {
                    const arr = await zarr.open(this.rootLocation.resolve(name), { kind: 'array' });
                    if (arr.shape.length === 3) {
                        selectedArrayName = name;
                        selectedArray = arr;
                        break;
                    }
                } catch (e) { }
            }
        }

        // 3. If still not found, look for any 2D array
        if (!selectedArray) {
            for (const name of potentialArrays) {
                try {
                    const arr = await zarr.open(this.rootLocation.resolve(name), { kind: 'array' });
                    if (arr.shape.length === 2) {
                        selectedArrayName = name;
                        selectedArray = arr;
                        break;
                    }
                } catch (e) { }
            }
        }

        if (!selectedArray || !selectedArrayName) {
            throw new Error('Could not find any valid 3D (time, y, x) or 2D (y, x) array in Zarr file');
        }

        this.array = selectedArray;
        this.variableName = selectedArrayName;
        this.is2D = this.array.shape.length === 2;

        console.log(`Selected Zarr array: ${this.variableName} (Shape: ${this.array.shape.join('x')})`);
    }

    public getVariableName(): string {
        return this.variableName;
    }

    async getSlice(timeIndex: number): Promise<SliceData> {
        if (!this.array) throw new Error('Dataset not initialized');

        // Check cache first
        const cached = globalSliceCache.get(this.fileId, timeIndex);
        if (cached) return cached;

        let data: any;

        if (this.is2D) {
            // For 2D array, ignore timeIndex and read the whole array
            // Shape: [y, x]
            const res = await zarr.get(this.array, [null, null]);
            data = res.data;
        } else {
            // Read chunk: [time, y, x]
            // We want the whole spatial slice for one time step
            const res = await zarr.get(this.array, [timeIndex, null, null]);
            data = res.data;
        }

        // Return the raw TypedArray (Uint8Array, Int16Array, Float32Array, etc.)
        // This avoids unnecessary conversion to Float32Array and saves memory
        // The SliceData type supports these arrays.
        const sliceData = data as SliceData;

        // Cache the result
        globalSliceCache.set(this.fileId, timeIndex, sliceData);

        return sliceData;
    }

    getCachedSlice(timeIndex: number): SliceData | undefined {
        return globalSliceCache.get(this.fileId, timeIndex);
    }

    public getArray(): zarr.Array<zarr.DataType> | null {
        return this.array;
    }

    public getShape(): number[] {
        if (!this.array) return [];
        return this.array.shape;
    }

    public async getAttributes(): Promise<Record<string, any>> {
        if (!this.array) return {};
        return this.array.attrs;
    }

    public async getVariable(name: string): Promise<any> {
        // Helper to open another array in the same group
        // We assume flat structure or relative path
        try {
            const loc = this.rootLocation.resolve(name);
            const arr = await zarr.open(loc, { kind: 'array' });
            const { data } = await zarr.get(arr);
            return { data, attrs: arr.attrs };
        } catch (e) {
            console.warn(`Failed to load variable ${name}`, e);
            return null;
        }
    }

    async getPixelTimeSeries(y: number, x: number): Promise<number[]> {
        if (!this.array) throw new Error('Dataset not initialized');

        if (this.is2D) {
            // For 2D array, the value is constant across time
            // We need to know how many time steps there are to return an array of correct length
            // But this method is usually called with knowledge of the time dimension from metadata
            // However, if it's 2D, we might just return a single value?
            // Or better, we read the single value and the caller handles it.
            // But the interface expects number[].
            // Let's read the single value.
            const { data } = await zarr.get(this.array, [y, x]);
            // Return a single-element array, or maybe we should throw if time series is requested for 2D?
            // For now, let's return a single value array. The caller might repeat it if needed.
            // Actually, if it's 2D, we don't have a time dimension, so "time series" is just one point.
            return [Number(data)];
        }

        // Read time series: [:, y, x]
        const { data } = await zarr.get(this.array, [null, y, x]);

        // Convert TypedArray to number array
        return Array.from(data as Float32Array);
    }

    dispose(): void {
        // Cleanup if needed
        this.array = null;
        this.clearCache();
    }

    clearCache(): void {
        globalSliceCache.clearForFile(this.fileId);
    }

    getStats(): { cacheSize: number; totalSizeMB: number } {
        return globalSliceCache.getStatsForFile(this.fileId);
    }
}
