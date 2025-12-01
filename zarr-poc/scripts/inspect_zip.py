import zipfile
import os

ZIP_FILE = os.path.join(os.path.dirname(__file__), '../../demo/illumination_map.zarr.zip')

try:
    with zipfile.ZipFile(ZIP_FILE, 'r') as z:
        print("Zip contents:")
        for name in z.namelist()[:10]:
            print(f" - {name}")
        
        if '.zgroup' in z.namelist():
            print("\nDETECTED: Zarr v2 (.zgroup found)")
        elif 'zarr.json' in z.namelist():
            print("\nDETECTED: Zarr v3 (zarr.json found)")
        else:
            print("\nUNKNOWN FORMAT")
except Exception as e:
    print(f"Error reading zip: {e}")
