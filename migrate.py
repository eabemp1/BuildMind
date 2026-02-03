#!/usr/bin/env python3
"""
Migration Script for Lumiere Upgrade
Helps you transition from the old version to the fixed version
"""

import os
import json
import shutil
from datetime import datetime

def backup_files():
    """Create backup of current files"""
    backup_dir = f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    os.makedirs(backup_dir, exist_ok=True)
    
    files_to_backup = [
        'main.py',
        'agents.py',
        'memory.py',
        'static/app.css',
        'static/app.js',
        'squad_memory.json',
        'user_profile.json'
    ]
    
    print(f"📦 Creating backup in {backup_dir}/...")
    for file in files_to_backup:
        if os.path.exists(file):
            dest = os.path.join(backup_dir, file)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copy2(file, dest)
            print(f"  ✅ Backed up: {file}")
    
    print(f"\n✨ Backup complete! Files saved to {backup_dir}/\n")
    return backup_dir

def migrate_squad_memory():
    """Migrate old squad_memory.json to new format if needed"""
    if not os.path.exists('squad_memory.json'):
        print("ℹ️  No squad_memory.json found - will create fresh on first run")
        return
    
    try:
        with open('squad_memory.json', 'r') as f:
            data = json.load(f)
        
        # Check if migration needed
        if data and isinstance(data, list) and 'specialty' in data[0]:
            print("✅ squad_memory.json is already in correct format")
            return
        
        # If old format, we'll let the new system recreate it
        print("⚠️  squad_memory.json is in old format")
        print("   It will be recreated with defaults on first run")
        
    except Exception as e:
        print(f"⚠️  Could not read squad_memory.json: {e}")
        print("   Will create fresh on first run")

def check_dependencies():
    """Check if all required packages are installed"""
    print("🔍 Checking dependencies...\n")
    
    required = {
        'fastapi': 'FastAPI',
        'uvicorn': 'Uvicorn',
        'dotenv': 'python-dotenv',
        'groq': 'Groq'
    }
    
    missing = []
    for module, package in required.items():
        try:
            __import__(module)
            print(f"  ✅ {package}")
        except ImportError:
            print(f"  ❌ {package} - MISSING")
            missing.append(package)
    
    if missing:
        print(f"\n⚠️  Missing packages: {', '.join(missing)}")
        print(f"   Install with: pip install {' '.join(missing)}")
        return False
    else:
        print("\n✅ All dependencies installed!\n")
        return True

def check_env_file():
    """Check if .env file exists and has required keys"""
    print("🔑 Checking environment variables...\n")
    
    if not os.path.exists('.env'):
        print("  ❌ .env file not found")
        print("\n📝 Creating .env template...")
        with open('.env', 'w') as f:
            f.write("# Lumiere Environment Variables\n")
            f.write("# Get your Groq API key from: https://console.groq.com\n\n")
            f.write("GROQ_API_KEY=your_groq_api_key_here\n")
        print("  ✅ Created .env template")
        print("  ⚠️  IMPORTANT: Add your Groq API key to .env file!")
        return False
    
    from dotenv import load_dotenv
    load_dotenv()
    
    groq_key = os.getenv('GROQ_API_KEY')
    if not groq_key or groq_key == 'your_groq_api_key_here':
        print("  ❌ GROQ_API_KEY not set or using placeholder")
        print("  ⚠️  IMPORTANT: Add your real Groq API key to .env file!")
        return False
    
    print(f"  ✅ GROQ_API_KEY is set (length: {len(groq_key)})\n")
    return True

def create_static_dir():
    """Ensure static directory exists"""
    if not os.path.exists('static'):
        os.makedirs('static')
        print("📁 Created static/ directory")
    
    if not os.path.exists('static/static'):
        os.makedirs('static/static')
        print("📁 Created static/static/ directory")

def print_upgrade_steps():
    """Print manual steps needed"""
    print("\n" + "="*60)
    print("📋 MANUAL UPGRADE STEPS")
    print("="*60)
    print("""
1. Replace main.py with main_FIXED.py:
   mv main_FIXED.py main.py

2. Replace agents.py with agents_FIXED.py:
   mv agents_FIXED.py agents.py

3. Update CSS file:
   mv app_IMPROVED.css static/app.css

4. Update README:
   mv README_NEW.md README.md

5. Add requirements.txt if not present:
   (Already created - just run: pip install -r requirements.txt)

6. Update your .env file with your Groq API key

7. Test the new version:
   python main.py

8. If everything works, you can delete:
   - day*_learn.py files
   - assignment_*.py files
   - capstone_day5.py
   - EvolvAI.py (if not used)
   - Your backup folder (after confirming everything works)
""")
    print("="*60 + "\n")

def main():
    print("\n" + "="*60)
    print("🚀 LUMIERE UPGRADE ASSISTANT")
    print("="*60 + "\n")
    
    # Step 1: Backup
    backup_dir = backup_files()
    
    # Step 2: Check dependencies
    deps_ok = check_dependencies()
    
    # Step 3: Check environment
    env_ok = check_env_file()
    
    # Step 4: Migrate data
    migrate_squad_memory()
    
    # Step 5: Create directories
    create_static_dir()
    
    # Step 6: Print upgrade steps
    print_upgrade_steps()
    
    # Final status
    print("="*60)
    print("📊 PRE-FLIGHT CHECK")
    print("="*60)
    print(f"  Backup created: ✅ ({backup_dir})")
    print(f"  Dependencies:   {'✅' if deps_ok else '❌ - Run: pip install -r requirements.txt'}")
    print(f"  Environment:    {'✅' if env_ok else '⚠️  - Add GROQ_API_KEY to .env'}")
    print("="*60 + "\n")
    
    if deps_ok and env_ok:
        print("✨ You're ready to upgrade! Follow the manual steps above.\n")
    else:
        print("⚠️  Fix the issues above before upgrading.\n")

if __name__ == "__main__":
    main()
