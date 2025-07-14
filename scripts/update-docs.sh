#!/bin/bash

# Update documentation script
set -e

DOCS_DIR="./demosdk-api-ref"

echo "🔄 Updating DemoSDK API Reference documentation..."

if [ -d "$DOCS_DIR" ]; then
    echo "📁 Documentation directory exists, pulling latest changes..."
    cd "$DOCS_DIR"
    git pull origin main
    cd ..
else
    echo "📁 Documentation directory not found, cloning repository..."
    git clone https://github.com/kynesyslabs/demosdk-api-ref.git "$DOCS_DIR"
fi

echo "✅ Documentation updated successfully!"

# Check if we should rebuild the MCP server
if [ "$1" = "--rebuild" ]; then
    echo "🔨 Rebuilding MCP server..."
    npm run build
    echo "✅ MCP server rebuilt successfully!"
fi