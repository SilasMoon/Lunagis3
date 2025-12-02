import type { DataSet, DataSlice, Layer, DataLayer, AnalysisLayer, DteCommsLayer, LpfCommsLayer, IlluminationLayer, TimeRange } from '../types';
import type { ILazyDataset } from './LazyDataset';
import { evaluate as evaluateExpression, getVariables as getExpressionVariables, compileExpression, evaluateCompiled } from './expressionEvaluator';
import { analysisCache, AnalysisCacheKey } from './analysisCache';

export const sanitizeLayerNameForExpression = (name: string): string => {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
};

export const calculateExpressionLayer = async (
    expression: string,
    availableLayers: Layer[],
    onProgress?: (message: string) => void
): Promise<{ dataset: DataSet; range: { min: number; max: number }; dimensions: { time: number; height: number; width: number; } }> => {
    const variables = getExpressionVariables(expression);
    const sourceLayers: (DataLayer | AnalysisLayer | DteCommsLayer | LpfCommsLayer)[] = [];

    for (const v of variables) {
        const layer = availableLayers.find(l => sanitizeLayerNameForExpression(l.name) === v);
        if (!layer || !('dataset' in layer)) {
            throw new Error(`Variable "${v}" does not correspond to a valid data layer.`);
        }
        sourceLayers.push(layer as DataLayer | AnalysisLayer | DteCommsLayer | LpfCommsLayer);
    }

    // Check cache before computing
    const layerIds = sourceLayers.map(l => l.id);
    const cacheKey = AnalysisCacheKey.forExpression(expression, layerIds);
    const cachedResult = analysisCache.getExpression(cacheKey);
    if (cachedResult) {
        if (onProgress) {
            onProgress('Using cached result... 100%');
        }
        return cachedResult;
    }

    if (sourceLayers.length === 0 && variables.length > 0) {
        throw new Error(`No layers found for variables in expression: ${variables.join(', ')}`);
    }

    if (sourceLayers.length === 0 && variables.length === 0) { // Expression is a constant
        const firstDataLayer = availableLayers.find(l => 'dataset' in l) as DataLayer | undefined;
        if (!firstDataLayer) throw new Error("Cannot evaluate a constant expression without at least one data layer to define dimensions.");
        const { time, height, width } = firstDataLayer.dimensions;
        const result = evaluateExpression(expression, {});
        const resultDataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width).fill(result)));
        // Use the constant value as both min and max
        return { dataset: resultDataset, range: { min: result, max: result }, dimensions: { time, height, width } };
    }

    const firstLayer = sourceLayers[0];
    const { time, height, width } = firstLayer.dimensions;
    if (!sourceLayers.every(l => l.dimensions.time === time && l.dimensions.height === height && l.dimensions.width === width)) {
        throw new Error("All layers used in an expression must have the same dimensions.");
    }

    // OPTIMIZATION 1: Pre-compile the expression once
    const compiledExpression = compileExpression(expression);

    // OPTIMIZATION 2: Pre-compute variable names to avoid repeated sanitization
    const layerVarNames = sourceLayers.map(l => sanitizeLayerNameForExpression(l.name));

    const resultDataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width).fill(0)));
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

    // OPTIMIZATION 3: Reuse context object instead of creating new one each iteration
    const context: { [key: string]: number } = {};

    // OPTIMIZATION 4: Better yielding - yield more frequently for better UI responsiveness
    // Process in chunks of ~50,000 pixels between yields
    const pixelsPerYield = 50000;
    let pixelCount = 0;
    const totalPixels = time * height * width;
    let lastReportedProgress = -1;

    // Report initial progress
    if (onProgress) {
        onProgress('Calculating expression... 0%');
        await yieldToMain();
    }

    for (let t = 0; t < time; t++) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Update context with current pixel values from all source layers
                for (let i = 0; i < sourceLayers.length; i++) {
                    context[layerVarNames[i]] = sourceLayers[i].dataset[t][y][x];
                }
                // Use pre-compiled expression for much faster evaluation
                const result = evaluateCompiled(compiledExpression, context);
                resultDataset[t][y][x] = result;

                // Yield to main thread periodically to keep UI responsive
                pixelCount++;
                if (pixelCount >= pixelsPerYield) {
                    // Update progress if callback provided
                    if (onProgress) {
                        const totalProcessed = t * height * width + y * width + x + 1;
                        const progress = Math.floor((totalProcessed / totalPixels) * 100);
                        // Only report if progress has changed to avoid excessive updates
                        if (progress !== lastReportedProgress) {
                            onProgress(`Calculating expression... ${progress}%`);
                            lastReportedProgress = progress;
                        }
                    }
                    await yieldToMain();
                    pixelCount = 0;
                }
            }
        }
    }

    // Report completion
    if (onProgress) {
        onProgress('Calculating expression... 100%');
    }

    // Calculate actual min/max range from the result dataset
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < time; t++) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const value = resultDataset[t][y][x];
                if (value < min) min = value;
                if (value > max) max = value;
            }
        }
    }

    // Handle edge case where all values are the same
    if (min === max) {
        max = min + 1;
    }

    const result = { dataset: resultDataset, range: { min, max }, dimensions: { time, height, width } };

    // Store result in cache
    analysisCache.setExpression(cacheKey, result);

    return result;
};


export const calculateDaylightFraction = async (
    dataset: DataSet,
    timeRange: TimeRange,
    dimensions: { height: number, width: number },
    sourceLayerId?: string,
    threshold?: number,
    lazyDataset?: ILazyDataset,
    onProgress?: (message: string) => void
) => {
    const { height, width } = dimensions;

    // Default threshold: 1 for binary data (backward compatible), 0 for continuous data
    const effectiveThreshold = threshold !== undefined ? threshold : 1;

    // Check cache before computing (if we have a source layer ID)
    if (sourceLayerId) {
        // For lazy datasets, we can't easily hash the content, so we use a placeholder or hash metadata
        // Ideally, we should have a better caching strategy for lazy layers
        const datasetHash = lazyDataset
            ? `lazy-${sourceLayerId}-${timeRange.start}-${timeRange.end}`
            : AnalysisCacheKey.hashDataset(dataset, { time: dataset.length, height, width });

        const cacheKey = AnalysisCacheKey.forDaylightFraction(sourceLayerId, datasetHash, timeRange, effectiveThreshold);
        const cachedResult = analysisCache.getDaylightFraction(cacheKey);
        if (cachedResult) {
            return cachedResult;
        }
    }

    const resultSlice: DataSlice = Array.from({ length: height }, () => new Array(width).fill(0));
    const totalHours = timeRange.end - timeRange.start + 1;

    if (totalHours <= 0) {
        return { slice: resultSlice, range: { min: 0, max: 100 } };
    }

    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));
    const totalSteps = timeRange.end - timeRange.start + 1;
    let processedSteps = 0;

    // Initialize dayHours counter for each pixel
    const dayHoursMap = new Float32Array(height * width).fill(0);

    for (let t = timeRange.start; t <= timeRange.end; t++) {
        let slice: number[][] | Float32Array | Uint8Array | Int8Array | Uint16Array | Int16Array | Int32Array | Uint32Array | Float64Array;

        if (lazyDataset) {
            // Fetch slice from lazy dataset
            try {
                slice = await lazyDataset.getSlice(t);
            } catch (e) {
                console.error(`Failed to load slice ${t} for daylight fraction calculation:`, e);
                continue; // Skip this frame if it fails
            }
        } else {
            // Use in-memory dataset
            if (t >= dataset.length) continue;
            slice = dataset[t];
        }

        // Process slice
        // Handle both 2D array (DataSet) and TypedArrays (LazyDataset)
        if (Array.isArray(slice) && Array.isArray(slice[0])) {
            // 2D Array
            let flatIndex = 0;
            const arraySlice = slice as number[][];
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const value = arraySlice[y][x];
                    if (effectiveThreshold === 1) {
                        if (value === 1) dayHoursMap[flatIndex]++;
                    } else {
                        if (value > effectiveThreshold) dayHoursMap[flatIndex]++;
                    }
                    flatIndex++;
                }
            }
        } else {
            // TypedArray or 1D array
            const typedSlice = slice as Float32Array; // Treat as generic array access
            for (let i = 0; i < typedSlice.length; i++) {
                const value = typedSlice[i];
                if (effectiveThreshold === 1) {
                    if (value === 1) dayHoursMap[i]++;
                } else {
                    if (value > effectiveThreshold) dayHoursMap[i]++;
                }
            }
        }

        processedSteps++;
        if (processedSteps % 10 === 0) {
            if (onProgress) {
                const percent = Math.floor((processedSteps / totalSteps) * 100);
                onProgress(`Calculating daylight fraction... ${percent}%`);
            }
            await yieldToMain();
        }
    }

    // Convert counts to fractions and populate resultSlice
    let flatIndex = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dayHours = dayHoursMap[flatIndex++];
            const fraction = (dayHours / totalHours) * 100;
            resultSlice[y][x] = fraction;
        }
    }

    const result = { slice: resultSlice, range: { min: 0, max: 100 } };

    // Store result in cache (if we have a source layer ID)
    if (sourceLayerId) {
        const datasetHash = lazyDataset
            ? `lazy-${sourceLayerId}-${timeRange.start}-${timeRange.end}`
            : AnalysisCacheKey.hashDataset(dataset, { time: dataset.length, height, width });

        const cacheKey = AnalysisCacheKey.forDaylightFraction(sourceLayerId, datasetHash, timeRange, effectiveThreshold);
        analysisCache.setDaylightFraction(cacheKey, result);
    }

    return result;
};

export const calculateNightfallDataset = async (sourceLayer: DataLayer | IlluminationLayer, threshold?: number): Promise<{ dataset: DataSet, range: { min: number, max: number }, maxDuration: number }> => {
    const { dataset, dimensions } = sourceLayer;
    const { time, height, width } = dimensions;

    // For illumination layers, use threshold to determine day/night (default: 0)
    // For data layers, values are already binary (0=night, 1=day)
    const isIlluminationLayer = sourceLayer.type === 'illumination';
    const effectiveThreshold = isIlluminationLayer ? (threshold ?? sourceLayer.illuminationThreshold ?? 0) : undefined;

    // Check cache before computing
    const datasetHash = AnalysisCacheKey.hashDataset(dataset, dimensions);
    const cacheKey = AnalysisCacheKey.forNightfall(sourceLayer.id, datasetHash);
    const cachedResult = analysisCache.getNightfall(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

    const resultDataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width).fill(0)));
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));
    let maxDuration = 0;
    let minDuration = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Convert to binary day/night: for illumination layers, apply threshold
            const pixelTimeSeries = dataset.map(slice => {
                const value = slice[y][x];
                if (isIlluminationLayer && effectiveThreshold !== undefined) {
                    return value < effectiveThreshold ? 0 : 1; // Below threshold = night (0), above = day (1)
                }
                return value; // Already binary for data layers
            });

            // --- Pass 1: Pre-compute all night periods for this pixel ---
            const nightPeriods: { start: number; end: number; duration: number }[] = [];
            let inNight = false;
            let nightStart = -1;

            for (let t = 0; t < time; t++) {
                const isCurrentlyNight = pixelTimeSeries[t] === 0;
                if (isCurrentlyNight && !inNight) {
                    // Sunset: a new night period begins
                    inNight = true;
                    nightStart = t;
                } else if (!isCurrentlyNight && inNight) {
                    // Sunrise: the night period ends
                    inNight = false;
                    const duration = t - nightStart;
                    nightPeriods.push({ start: nightStart, end: t, duration });
                }
            }
            // Handle case where the series ends during a night period
            if (inNight) {
                const duration = time - nightStart;
                nightPeriods.push({ start: nightStart, end: time, duration });
            }

            // --- Pass 2: Populate the forecast using the pre-computed list ---
            let nextNightIndex = 0;
            for (let t = 0; t < time; t++) {
                if (pixelTimeSeries[t] === 1) { // It's DAY
                    // Find the next night period that starts after the current time
                    while (nextNightIndex < nightPeriods.length && nightPeriods[nextNightIndex].start <= t) {
                        nextNightIndex++;
                    }

                    if (nextNightIndex < nightPeriods.length) {
                        const nextNight = nightPeriods[nextNightIndex];
                        resultDataset[t][y][x] = nextNight.duration;
                        if (nextNight.duration > maxDuration) maxDuration = nextNight.duration;
                    } else {
                        resultDataset[t][y][x] = 0; // No more night periods
                    }
                } else { // It's NIGHT
                    // Find which night period the current time falls into
                    const currentNight = nightPeriods.find(p => t >= p.start && t < p.end);
                    if (currentNight) {
                        const forecastValue = -currentNight.duration;
                        resultDataset[t][y][x] = forecastValue;
                        if (forecastValue < minDuration) minDuration = forecastValue;
                    } else {
                        // This case should ideally not happen if logic is correct
                        resultDataset[t][y][x] = -1;
                    }
                }
            }
        }
        if (y % 10 === 0) await yieldToMain();
    }

    const result = { dataset: resultDataset, range: { min: minDuration, max: maxDuration }, maxDuration };

    // Store result in cache
    analysisCache.setNightfall(cacheKey, result);

    return result;
};
