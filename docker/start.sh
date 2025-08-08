#!/bin/sh

echo "🚀 Starting Demos SDK Documentation MCP Server..."

# Initialize documentation on startup
echo "📥 Cloning/updating documentation..."
npm run clone-docs

# Start cron daemon in background for periodic updates
echo "⏰ Starting cron for periodic updates..."
crond -b

# Start the MCP server
echo "🌐 Starting MCP server..."
exec npm run start:http