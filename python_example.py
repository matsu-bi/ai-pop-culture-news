#!/usr/bin/env python3
"""
Example Python script for AI Pop Culture News project.
This demonstrates that the Python environment is properly set up.
"""

import sys
import os
from pathlib import Path

def main():
    print("🐍 AI Pop Culture News - Python Setup Complete!")
    print(f"Python version: {sys.version}")
    print(f"Current working directory: {os.getcwd()}")
    print(f"Virtual environment: {sys.prefix}")
    
    if hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
        print("✅ Running in virtual environment")
    else:
        print("⚠️  Not running in virtual environment")
    
    project_root = Path(__file__).parent
    print(f"Project root: {project_root}")
    
    print("✅ Python environment working correctly!")
    return "Setup successful"

if __name__ == "__main__":
    main()
