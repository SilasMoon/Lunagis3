import * as zarr from 'zarrita';
import { ILazyDataset, SliceData, globalSliceCache } from '../LazyDataset';
import { ZipFileStore } from './ZipFileStore';

export class ZarrLazyDataset implements ILazyDataset {
    private store: ZipFileStore;
    private array: zarr.Array<zarr.DataType> | null = null;
    private fileId: string;
    private rootLocation: zarr.Location<zarr.Readable>;

    constructor(file: File) {
        this.fileId = file.name;
        this.store = new ZipFileStore(file);
        this.rootLocation = new zarr.Location(this.store);
    }

    async init(): Promise<void> {
        await this.store.init();

        // Open root group
        const root = await zarr.open(this.rootLocation, { kind: 'group' });

        // Try to find the main variable
        // For now, hardcoded to 'illumination' or try to find a 3D array
        try {
            this.array = await zarr.open(this.rootLocation.resolve('illumination'), { kind: 'array' });
        } catch (e) {
            console.warn('Could not open "illumination", checking other keys...');
            // TODO: Implement better variable detection
            throw new Error('Could not find "illumination" array in Zarr file');
        }
    }

    async getSlice(timeIndex: number): Promise<SliceData> {
        if (!this.array) throw new Error('Dataset not initialized');

        // Check cache first
        const cached = globalSliceCache.get(this.fileId, timeIndex);
        if (cached) return cached;

        // Read chunk: [time, y, x]
        // We want the whole spatial slice for one time step
        const { data } = await zarr.get(this.array, [timeIndex, null, null]);

        // Zarrita returns a TypedArray (usually Float32Array for our data)
        // We assume it's flat or compatible
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
