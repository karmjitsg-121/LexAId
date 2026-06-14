#!/usr/bin/env python3
"""
LexAid Legal Knowledge Base — Embedder Module
Generates semantic embeddings for legal texts using a local SentenceTransformer model.
"""

import logging
from typing import List, Union
from sentence_transformers import SentenceTransformer
from ingestion.config import EMBEDDING_MODEL

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

class LegalEmbedder:
    def __init__(self, model_name: str = EMBEDDING_MODEL):
        logger.info(f"Initializing embedding model: {model_name}...")
        try:
            # This will download the model on the first run (~120MB)
            self.model = SentenceTransformer(model_name)
            logger.info("Embedding model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise

    def get_embedding(self, text: str) -> List[float]:
        """Generate a single embedding vector for a string."""
        if not text or not text.strip():
            # Return zero vector of appropriate size if text is empty
            return [0.0] * self.model.get_sentence_embedding_dimension()
        
        embeddings = self.model.encode([text], show_progress_bar=False)
        return embeddings[0].tolist()

    def get_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embedding vectors for a batch of strings."""
        if not texts:
            return []
            
        # Clean and replace empty strings with placeholder text or space
        cleaned_texts = [t if (t and t.strip()) else " " for t in texts]
        
        logger.info(f"Generating embeddings for batch of {len(texts)} sections...")
        embeddings = self.model.encode(
            cleaned_texts,
            batch_size=32,
            show_progress_bar=True
        )
        return [emb.tolist() for emb in embeddings]

# Simple execution test
if __name__ == "__main__":
    embedder = LegalEmbedder()
    test_text = "Equality before law is a fundamental right in India under Article 14."
    vector = embedder.get_embedding(test_text)
    print(f"Test vector dimension: {len(vector)}")
    print(f"Test vector sample (first 5 values): {vector[:5]}")
