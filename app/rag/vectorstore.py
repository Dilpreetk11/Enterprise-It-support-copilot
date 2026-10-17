"""
Pinecone vector store with local HuggingFace sentence-transformer embeddings.

Embedding model : sentence-transformers/all-MiniLM-L6-v2  (384-dim, free, local)
Vector DB       : Pinecone serverless (cosine similarity)
"""
import logging
import time
from typing import List

from langchain_core.documents import Document
from langchain_community.embeddings import HuggingFaceEmbeddings

try:
    from langchain_pinecone import PineconeVectorStore
except ImportError:
    try:
        from langchain_pinecone import Pinecone as PineconeVectorStore
    except ImportError:
        from langchain_community.vectorstores import Pinecone as PineconeVectorStore

from pinecone import Pinecone, ServerlessSpec

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Embedding dimension map ────────────────────────────────────────────────────
EMBEDDING_DIMENSIONS: dict[str, int] = {
    "sentence-transformers/all-minilm-l6-v2": 384,
    "all-minilm-l6-v2": 384,
    "sentence-transformers/all-mpnet-base-v2": 768,
}

_embeddings = None
_vectorstore = None


def get_embedding_dimension(model_name: str | None = None) -> int:
    name = (model_name or settings.embedding_model or "").strip().lower()
    if not name:
        raise RuntimeError("EMBEDDING_MODEL is not configured.")
    if name in EMBEDDING_DIMENSIONS:
        return EMBEDDING_DIMENSIONS[name]
    if "minilm-l6" in name:
        return 384
    if "mpnet" in name:
        return 768
    raise ValueError(
        f"Unknown embedding model '{name}'. Add its dimension to EMBEDDING_DIMENSIONS."
    )


def get_embeddings() -> HuggingFaceEmbeddings:
    """Return a cached HuggingFace embeddings object."""
    global _embeddings
    if _embeddings is None:
        import os
        try:
            import torch
            torch.set_num_threads(1)
        except Exception:
            pass
        cache_folder = os.getenv("HF_HOME", "/app/model_cache")
        logger.info("Loading local embedding model: %s (cache: %s)", settings.embedding_model, cache_folder)
        _embeddings = HuggingFaceEmbeddings(
            model_name=settings.embedding_model,
            cache_folder=cache_folder if os.path.exists(cache_folder) else None,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
        logger.info("Embedding model loaded.")
    return _embeddings


def ensure_index():
    """Create the Pinecone index if it does not exist; return the Index object."""
    if not settings.pinecone_api_key:
        raise RuntimeError(
            "PINECONE_API_KEY is not set. Add it to your .env file."
        )

    desired_dim = get_embedding_dimension()
    pc = Pinecone(api_key=settings.pinecone_api_key)

    existing_names = [idx.name for idx in pc.list_indexes()]

    # If index exists, check dimension and reuse directly
    if settings.pinecone_index_name in existing_names:
        try:
            info = pc.describe_index(settings.pinecone_index_name)
            current_dim = getattr(info, "dimension", None)
            if current_dim is None and hasattr(info, "get"):
                current_dim = info.get("dimension")
            if current_dim is not None and int(current_dim) == desired_dim:
                return pc.Index(settings.pinecone_index_name)
        except Exception as exc:
            logger.warning("Could not describe index %s: %s", settings.pinecone_index_name, exc)
            return pc.Index(settings.pinecone_index_name)

    # If index exists with wrong dimension, delete and recreate.
    if settings.pinecone_index_name in existing_names:
        logger.warning(
            "Pinecone index '%s' has dimension mismatch with %s. Recreating.",
            settings.pinecone_index_name,
            desired_dim,
        )
        try:
            pc.delete_index(settings.pinecone_index_name)
            time.sleep(2)
        except Exception as exc:
            logger.error("Failed to delete mismatched index: %s", exc)

    # Create index if it doesn't exist.
    if settings.pinecone_index_name not in [idx.name for idx in pc.list_indexes()]:
        logger.info(
            "Creating Pinecone index '%s' (dim=%s).",
            settings.pinecone_index_name,
            desired_dim,
        )
        try:
            pc.create_index(
                name=settings.pinecone_index_name,
                dimension=desired_dim,
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-east-1"),
            )
            for _ in range(30):
                if pc.describe_index(settings.pinecone_index_name).status["ready"]:
                    break
                time.sleep(1)
            logger.info("Pinecone index ready.")
        except Exception as exc:
            logger.error("Error creating Pinecone index: %s", exc)

    return pc.Index(settings.pinecone_index_name)


def get_vectorstore() -> PineconeVectorStore:
    """Return the cached PineconeVectorStore, initializing on first call."""
    global _vectorstore
    if _vectorstore is None:
        index = ensure_index()
        _vectorstore = PineconeVectorStore(
            index=index,
            embedding=get_embeddings(),
            namespace=settings.pinecone_namespace,
        )
    return _vectorstore


def get_retriever():
    """Return a LangChain retriever backed by Pinecone."""
    return get_vectorstore().as_retriever(search_kwargs={"k": settings.top_k})


def add_documents(chunks: List[Document]) -> List[str]:
    """Embed and upsert document chunks into Pinecone. Returns vector IDs."""
    if not chunks:
        return []
    store = get_vectorstore()
    ids = store.add_documents(chunks)
    logger.info("Indexed %d chunks into Pinecone.", len(ids))
    return ids
