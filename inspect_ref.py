
import zipfile
import json
import sys
import os

def inspect_zarr_zip(zip_path):
    print(f"Inspecting: {zip_path}")
    
    if not os.path.exists(zip_path):
        print("File not found!")
        return

    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            print("\nFiles in archive:")
            for info in z.infolist():
                print(f" - {info.filename} ({info.file_size} bytes)")
            
            # Try to read .zgroup or .zarray
            zgroup = None
            zattrs = None
            
            if '.zgroup' in z.namelist():
                with z.open('.zgroup') as f:
                    zgroup = json.load(f)
                    print("\n.zgroup:", json.dumps(zgroup, indent=2))
            
            if '.zattrs' in z.namelist():
                with z.open('.zattrs') as f:
                    zattrs = json.load(f)
                    print("\n.zattrs:", json.dumps(zattrs, indent=2))
            
            # Look for arrays
            print("\nArrays:")
            for name in z.namelist():
                if name.endswith('.zarray'):
                    print(f"\nFound array metadata: {name}")
                    with z.open(name) as f:
                        zarray = json.load(f)
                        print(json.dumps(zarray, indent=2))
                    
                    # Check for corresponding attributes
                    attr_name = name.replace('.zarray', '.zattrs')
                    if attr_name in z.namelist():
                         with z.open(attr_name) as f:
                            attrs = json.load(f)
                            print(f"Attributes for {name}:", json.dumps(attrs, indent=2))

    except Exception as e:
        print(f"Error reading zip file: {e}")

if __name__ == "__main__":
    inspect_zarr_zip(r"c:\Users\geoff\Lunagis2\Reference\orbiter_visibility.zarr.zip")
