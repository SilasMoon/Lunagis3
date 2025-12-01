try:
    import numcodecs
    print(f"Numcodecs version: {numcodecs.__version__}")
    from numcodecs import blosc
    print("Blosc imported successfully")
    print(f"Has cbuffer_sizes? {hasattr(blosc, 'cbuffer_sizes')}")
    from numcodecs.blosc import cbuffer_sizes
    print("cbuffer_sizes imported successfully")
except Exception as e:
    print(f"Error: {e}")
