"""Build-time patch of Mem0's server/main.py: Claude for extraction, Ollama for embeddings.

Each replacement must match exactly once, so a Mem0 upgrade that moves this code fails the build
instead of silently running with OpenAI defaults.
"""
import sys

path = sys.argv[1]
src = open(path, encoding="utf8").read()

REPLACEMENTS = [
    (
        'BUNDLED_EMBEDDER_PROVIDERS = ("openai", "gemini")',
        'BUNDLED_EMBEDDER_PROVIDERS = ("openai", "gemini", "ollama")',
    ),
    (
        '            "collection_name": POSTGRES_COLLECTION_NAME,\n        },',
        '            "collection_name": POSTGRES_COLLECTION_NAME,\n'
        '            "embedding_model_dims": int(os.environ.get("MEM0_EMBEDDING_DIMS", "768")),\n        },',
    ),
    (
        '        "provider": "openai",\n'
        '        "config": {"api_key": OPENAI_API_KEY, "temperature": 0.2, "model": DEFAULT_LLM_MODEL},',
        '        "provider": "anthropic",\n'
        '        "config": {"api_key": os.environ.get("ANTHROPIC_API_KEY"), "temperature": 0.2,\n'
        '                   "model": os.environ.get("MEM0_LLM_MODEL", "claude-haiku-5-5"), "max_tokens": 4000},',
    ),
    (
        '    "embedder": {"provider": "openai", "config": {"api_key": OPENAI_API_KEY, "model": DEFAULT_EMBEDDER_MODEL}},',
        '    "embedder": {"provider": "ollama", "config": {\n'
        '        "model": os.environ.get("MEM0_EMBEDDER_MODEL", "nomic-embed-text"),\n'
        '        "ollama_base_url": os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434"),\n'
        '        "embedding_dims": int(os.environ.get("MEM0_EMBEDDING_DIMS", "768"))}},',
    ),
]

for old, new in REPLACEMENTS:
    n = src.count(old)
    if n != 1:
        sys.exit(f"patch_main.py: expected one match, found {n}:\n{old}")
    src = src.replace(old, new)

open(path, "w", encoding="utf8").write(src)
print("Mem0 server patched: anthropic LLM, ollama embedder")
