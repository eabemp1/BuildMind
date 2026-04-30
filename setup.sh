#!/bin/bash
# BuildMind local setup checker
# Run with: bash setup.sh

set -e

echo ""
echo "BuildMind — Setup Check"
echo "========================"
echo ""

# Check Node
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  echo "✓ Node.js $NODE_VER"
else
  echo "✗ Node.js not found — install from nodejs.org"
  exit 1
fi

# Check npm
if command -v npm &>/dev/null; then
  echo "✓ npm $(npm -v)"
else
  echo "✗ npm not found"
  exit 1
fi

# Check .env.local
if [ -f ".env.local" ]; then
  echo "✓ .env.local found"

  # Check required keys
  if grep -q "NEXT_PUBLIC_SUPABASE_URL=https" .env.local; then
    echo "  ✓ SUPABASE_URL set"
  else
    echo "  ✗ NEXT_PUBLIC_SUPABASE_URL missing or not filled in"
  fi

  if grep -q "NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ" .env.local; then
    echo "  ✓ SUPABASE_ANON_KEY set"
  else
    echo "  ✗ NEXT_PUBLIC_SUPABASE_ANON_KEY missing"
  fi

  if grep -q "GROQ_API_KEY=gsk_" .env.local; then
    echo "  ✓ GROQ_API_KEY set"
  else
    echo "  ✗ GROQ_API_KEY missing — get one free at console.groq.com/keys"
  fi
else
  echo "✗ .env.local not found"
  echo ""
  echo "  Run: cp .env.local.example .env.local"
  echo "  Then fill in your Supabase URL, anon key, and Groq key"
  echo ""
  exit 1
fi

# Install dependencies if node_modules missing
if [ ! -d "node_modules" ]; then
  echo ""
  echo "Installing dependencies..."
  npm install
else
  echo "✓ node_modules present"
fi

echo ""
echo "========================"
echo "Ready. Starting dev server..."
echo "Open http://localhost:3000"
echo ""
npm run dev
