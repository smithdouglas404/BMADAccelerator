#!/bin/sh
# Runs Ollama and makes sure the embedding model is there. Only embeddings run here (no chat model).
set -e
ollama serve &
until ollama list >/dev/null 2>&1; do sleep 1; done
ollama pull "${EMBED_MODEL:-nomic-embed-text}"
wait
