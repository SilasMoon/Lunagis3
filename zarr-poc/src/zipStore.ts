import * as fflate from 'fflate';
import * as zarr from 'zarrita';

export class ZipFileStore implements zarr.Readable {
    private file: File;
    private entries: { [key: string]: Uint8Array } = {};

    constructor(file: File) {
        this.file = file;
    }

    async init() {
        const buffer = await this.file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);

        return new Promise<void>((resolve, reject) => {
            fflate.unzip(uint8, (err, unzipped) => {
                if (err) return reject(err);
                this.entries = unzipped;
                console.log('Zip entries:', Object.keys(this.entries));
                resolve();
            });
        });
    }

    async get(key: string): Promise<Uint8Array | undefined> {
        // Normalize key: remove leading /
        const normalizedKey = key.startsWith('/') ? key.slice(1) : key;
        const entry = this.entries[normalizedKey];

        console.log(`[ZipStore] get '${key}' -> '${normalizedKey}' found? ${!!entry}`);

        if (entry && (key.endsWith('.json') || key.endsWith('.zarray') || key.endsWith('.zgroup') || key.endsWith('.zattrs'))) {
            try {
                const text = new TextDecoder().decode(entry);
                console.log(`[ZipStore] Content of ${key}:`, text);
            } catch (e) {
                console.warn(`[ZipStore] Failed to decode text for ${key}`, e);
            }
        }

        return entry;
    }
}
