import xarray as xr
import zarr
import os
import sys

# Paths
INPUT_FILE = os.path.join(os.path.dirname(__file__), '../../demo/illumination_map.nc')
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), '../../demo/illumination_map.zarr.zip')

def convert():
    print(f"Opening {INPUT_FILE}...")
    if not os.path.exists(INPUT_FILE):
        print(f"Error: Input file not found at {INPUT_FILE}")
        sys.exit(1)

    # Open dataset
    ds = xr.open_dataset(INPUT_FILE)
    print("Dataset opened.")
    print(ds)

    # Check for the main variable (usually 'illumination' or similar)
    # We'll assume 'illumination' based on previous context, but let's be dynamic if possible
    var_name = 'illumination'
    if var_name not in ds:
        # Fallback to finding a 3D variable
        for v in ds.data_vars:
            if len(ds[v].dims) == 3:
                var_name = v
                break
    
    print(f"Processing variable: {var_name}")

    # Re-chunking
    # We want time=1 for fast random access to frames
    # We want spatial chunks to be reasonable (e.g., 512x512 or full slice if small)
    # Let's go with 512x512 for scalability
    chunks = {'time': 1, 'height': 512, 'width': 512}
    
    # Handle dimension names if they differ (e.g., 'y', 'x' vs 'height', 'width')
    if 'y' in ds.dims: chunks['y'] = 512
    if 'x' in ds.dims: chunks['x'] = 512
    if 'lat' in ds.dims: chunks['lat'] = 512
    if 'lon' in ds.dims: chunks['lon'] = 512

    # Remove keys that aren't in the dataset dims
    chunks = {k: v for k, v in chunks.items() if k in ds.dims}

    print(f"Re-chunking to: {chunks}")
    ds_chunked = ds.chunk(chunks)

    # Compression (Disabled due to environment issues)
    # import numcodecs
    # compressor = numcodecs.Blosc(cname='zstd', clevel=3, shuffle=numcodecs.Blosc.SHUFFLE)
    # encoding = {v: {'compressor': compressor} for v in ds_chunked.data_vars}
    encoding = {}

    print(f"Writing to {OUTPUT_FILE}...")
    
    # Remove existing file if it exists
    if os.path.exists(OUTPUT_FILE):
        os.remove(OUTPUT_FILE)

    # Write to DirectoryStore first to ensure v2 format
    # Then zip it manually. This avoids zarr.ZipStore v3 issues.
    
    TEMP_DIR = OUTPUT_FILE.replace('.zip', '')
    if os.path.exists(TEMP_DIR):
        import shutil
        shutil.rmtree(TEMP_DIR)
    
    # Create v2 group in directory
    # Passing a path to open_group with zarr_format=2 creates a DirectoryStore v2
    zarr.open_group(store=TEMP_DIR, mode='w', zarr_format=2)
    print("Created Zarr v2 DirectoryStore.")
    
    # Write data
    # Pass the path string, not the Group object. mode='a' allows adding variables to the existing v2 store.
    ds_chunked.to_zarr(TEMP_DIR, mode='a', encoding=encoding, consolidated=False)
    
    print("Zarr write complete. Zipping...")
    
    import zipfile
    with zipfile.ZipFile(OUTPUT_FILE, 'w', zipfile.ZIP_STORED) as zipf:
        for root, dirs, files in os.walk(TEMP_DIR):
            for file in files:
                file_path = os.path.join(root, file)
                # Archive name should be relative to TEMP_DIR
                arcname = os.path.relpath(file_path, TEMP_DIR)
                zipf.write(file_path, arcname)
    
    # Cleanup
    import shutil
    shutil.rmtree(TEMP_DIR)

    print("Conversion complete!")

if __name__ == "__main__":
    convert()
