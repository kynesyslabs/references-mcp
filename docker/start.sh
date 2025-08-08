#!/bin/sh

echo "🚀 Starting Demos SDK Documentation MCP Server..."

# Initialize documentation on startup
echo "📥 Cloning/updating documentation..."
npm run clone-docs

# Note: Periodic updates are now handled by the Node.js scheduler in the MCP server

# Start the MCP server
echo "🌐 Starting MCP server..."
exec npm run start:http