#!/bin/bash

echo "🔍 Checking Vercel Deployment Configuration..."
echo ""

# Check if we're in backend directory
if [ ! -f "server.js" ]; then
    echo "❌ Error: Not in backend directory!"
    echo "   Run: cd backend"
    exit 1
fi

echo "✅ In backend directory"
echo ""

# Check required files
echo "📁 Checking required files:"

if [ -f "api/index.js" ]; then
    echo "✅ api/index.js exists"
else
    echo "❌ api/index.js missing!"
    echo "   Creating..."
    mkdir -p api
    echo "const app = require('../server');" > api/index.js
    echo "module.exports = app;" >> api/index.js
    echo "✅ Created api/index.js"
fi

if [ -f "vercel.json" ]; then
    echo "✅ vercel.json exists"
    
    # Check if it's simplified
    if grep -q '"functions"' vercel.json; then
        echo "⚠️  vercel.json has 'functions' config (might cause issues)"
        echo "   Consider using simplified version"
    fi
    
    if grep -q '"headers"' vercel.json; then
        echo "⚠️  vercel.json has 'headers' config (might cause issues)"
        echo "   Consider using simplified version"
    fi
    
    if ! grep -q '"functions"' vercel.json && ! grep -q '"headers"' vercel.json; then
        echo "✅ vercel.json is simplified (good!)"
    fi
else
    echo "❌ vercel.json missing!"
    echo "   Creating minimal version..."
    cat > vercel.json << 'EOF'
{
  "version": 2,
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api"
    }
  ]
}
EOF
    echo "✅ Created vercel.json"
fi

if [ -f "server.js" ]; then
    echo "✅ server.js exists"
else
    echo "❌ server.js missing!"
    exit 1
fi

if [ -f "package.json" ]; then
    echo "✅ package.json exists"
else
    echo "❌ package.json missing!"
    exit 1
fi

echo ""
echo "📦 Checking package.json..."

# Check if module.exports in server.js
if grep -q "module.exports = app" server.js; then
    echo "✅ server.js exports app"
else
    echo "⚠️  server.js might not export app"
    echo "   Make sure it has: module.exports = app;"
fi

echo ""
echo "🔧 Configuration Summary:"
echo ""

if [ -f "api/config.json" ]; then
    echo "api/config.json contents:"
    cat api/config.json
    echo ""
    
    # Check for Pro-only features
    if grep -q '"maxDuration": 60' api/config.json || grep -q '"memory": 3008' api/config.json; then
        echo "⚠️  Pro plan features detected in api/config.json"
        echo "   If you're on Hobby plan, this might cause deployment failure"
        echo "   To fix: mv api/config.json api/config.json.backup"
    fi
else
    echo "ℹ️  No api/config.json (will use Vercel defaults)"
fi

echo ""
echo "vercel.json contents:"
cat vercel.json
echo ""

echo "✅ Configuration check complete!"
echo ""
echo "🚀 Ready to deploy? Run:"
echo "   vercel --prod"
echo ""
echo "💡 If deployment fails:"
echo "   1. Check you have Vercel CLI: npm i -g vercel"
echo "   2. Login to Vercel: vercel login"
echo "   3. View logs: vercel logs"
echo "   4. Try removing api/config.json: mv api/config.json api/config.json.backup"
echo ""
