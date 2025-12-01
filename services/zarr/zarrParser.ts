import { ZarrLazyDataset } from './ZarrLazyDataset';
import { NetCdf4ParseResult, NetCdf4Metadata } from '../netcdf4Parser';
import * as zarr from 'zarrita';

export async function parseZarrZip(file: File): Promise<NetCdf4ParseResult> {
    const reader = new ZarrLazyDataset(file);
    await reader.init();

    const array = reader.getArray();
    if (!array) throw new Error("Failed to initialize Zarr array");

    const shape = array.shape; // [time, y, x] or [y, x]
    let timeDim = 1;
    let heightDim = 0;
    let widthDim = 0;

    if (shape.length === 3) {
        timeDim = shape[0];
        heightDim = shape[1];
        widthDim = shape[2];
    } else if (shape.length === 2) {
        timeDim = 1;
        heightDim = shape[0];
        widthDim = shape[1];
    } else {
        throw new Error(`Expected 2D or 3D array, got ${shape.length}D`);
    }

    const dimensions = {
        time: timeDim,
        height: heightDim,
        width: widthDim
    };

    // Get attributes
    const attrs = await reader.getAttributes();

    // Fetch coordinates
    const xVar = await reader.getVariable('x');
    const yVar = await reader.getVariable('y');

    if (!xVar || !yVar) {
        console.warn("Could not find x or y coordinates in Zarr file");
    }

    const x = xVar ? xVar.data : new Float32Array(0);
    const y = yVar ? yVar.data : new Float32Array(0);

    // Fetch time if available
    const timeVar = await reader.getVariable('time');
    const timeValues = timeVar ? Array.from(timeVar.data as Float32Array | Float64Array) : undefined;
    const timeUnit = timeVar?.attrs?.units || attrs.time_unit || 'hours since 2024-01-01 00:00:00';

    // Construct metadata
    const metadata: NetCdf4Metadata = {
        variableName: reader.getVariableName(),
        title: attrs.title || file.name,
        institution: attrs.institution,
        source: attrs.source,
        conventions: attrs.conventions,
        timeUnit: timeUnit,
        timeValues: timeValues,
        crs: {
            // Default to polar stereographic if not specified, or try to read from grid_mapping
            projection: 'stereographic',
            spatialRef: attrs.spatial_ref || '+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs'
        }
    };

    return {
        reader: reader,
        shape: [timeDim, heightDim, widthDim],
        dimensions,
        metadata,
        coordinates: {
            x: x as Float32Array,
            y: y as Float32Array
        }
    };
}
