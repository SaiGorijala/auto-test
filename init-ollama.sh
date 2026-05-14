#!/bin/bash
# init-ollama.sh - Initialize Ollama with required models

set -e

echo "Waiting for Ollama to be ready..."
until curl -f http://ollama:11434/api/tags > /dev/null 2>&1; do
  echo "Ollama not ready, waiting..."
  sleep 5
done

echo "Pulling qwen2.5-coder:3b model..."
docker compose exec ollama ollama pull qwen2.5-coder:3b

echo "Ollama initialization complete!"