#!/bin/bash

echo "🚀 Deploying Backend to Vercel..."
echo ""

# Check if api/index.js exists
if [ ! -f "api/index.js" ]; then
    echo "❌ Error: api/index.js not found!"
    echo "Creating api/index.js..."
    mkdir -p api
    echo "const app = require('../server');" > api/index.js
    echo "module.exports = app;" >> api/index.js
    echo "✅ Created api/index.js"
fi

# Check if api/config.json exists and has maxBodySize
if [ ! -f "api/config.json" ]; then
    echo "❌ Error: api/config.json not found!"
    echo "Creating api/config.json with upload limits..."
    mkdir -p api
    echo '{' > api/config.json
    echo '  "maxDuration": 60,' >> api/config.json
    echo '  "memory": 3008,' >> api/config.json
    echo '  "maxBodySize": "50mb"' >> api/config.json
    echo '}' >> api/config.json
    echo "✅ Created api/config.json"
else
    # Check if maxBodySize is configured
    if ! grep -q "maxBodySize" api/config.json; then
        echo "⚠️  Warning: api/config.json missing maxBodySize!"
        echo "   This may cause upload failures for files > 0.5MB"
        echo "   Please add: \"maxBodySize\": \"50mb\""
    fi
fi

# Check if vercel.json exists
if [ ! -f "vercel.json" ]; then
    echo "❌ Error: vercel.json not found!"
    exit 1
fi

# Check if vercel.json has functions configuration
if ! grep -q '"functions"' vercel.json; then
    echo "⚠️  Warning: vercel.json missing functions configuration!"
    echo "   This may affect serverless function limits"
fi

echo ""
echo "📋 Pre-deployment checklist:"
echo "✅ api/index.js exists"
echo "✅ api/config.json exists"
echo "✅ vercel.json exists"
echo ""

echo "🔍 Configuration check:"
if grep -q "maxBodySize" api/config.json; then
    echo "✅ Upload limits configured"
else
    echo "⚠️  Upload limits NOT configured"
fi

if grep -q '"functions"' vercel.json; then
    echo "✅ Functions config present"
else
    echo "⚠️  Functions config missing"
fi
echo ""

# Deploy
echo "🚀 Starting deployment..."
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📌 Next steps:"
echo "1. Go to Vercel Dashboard"
echo "2. Set all environment variables (especially Cloudinary)"
echo "3. Wait 3-5 minutes for propagation"
echo "4. Test health: curl https://your-domain.vercel.app/health"
echo "5. Test upload: Try uploading a file > 1MB"
echo ""
echo "⚠️  Important: Ensure you're on Vercel Pro plan for files > 4.5MB"
echo ""
