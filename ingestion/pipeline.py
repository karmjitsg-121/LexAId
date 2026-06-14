#!/usr/bin/env python3
"""
LexAid Legal Knowledge Base — Ingestion Pipeline Orchestrator
Controls parsing, embedding, and uploading of laws to Supabase.
"""

import sys
import argparse
import logging
from typing import List, Dict, Any
from dotenv import load_dotenv

from ingestion.config import SUPABASE_URL, SUPABASE_SERVICE_KEY, SEED_ACTS, SCRAPE_ACTS
from ingestion.seed_laws import LAW_SEEDS
from ingestion.embedder import LegalEmbedder
from ingestion.parser import LegalParser
from ingestion.scraper import IndiaCodeScraper

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Try importing supabase, if not installed print warning but don't crash
try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False

class LegalIngestionPipeline:
    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.embedder = None
        self.supabase = None
        
        # Initialize Supabase client
        if not self.dry_run:
            if not SUPABASE_AVAILABLE:
                logger.error("Supabase package not installed! Run `pip install -r requirements.txt` first.")
                sys.exit(1)
            if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
                logger.warning(
                    "Supabase URL or Service Key is missing from environment variables!\n"
                    "Pipeline will run in DRY-RUN mode. Set these in ingestion/.env to upload to Supabase."
                )
                self.dry_run = True
            else:
                try:
                    self.supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                    logger.info("Connected to Supabase client successfully.")
                except Exception as e:
                    logger.error(f"Failed to connect to Supabase: {e}")
                    logger.warning("Falling back to DRY-RUN mode.")
                    self.dry_run = True

    def lazy_load_embedder(self):
        """Load the model only when embedding generation is about to happen."""
        if self.embedder is None:
            self.embedder = LegalEmbedder()

    def process_law(self, act_meta: Dict[str, Any], chapters_data: List[Dict[str, Any]]):
        """Processes a structured law: uploads metadata, chapters, computes embeddings, and inserts sections."""
        act_name = act_meta["act_name"]
        logger.info(f"=== Processing Act: {act_name} ===")
        
        law_id = None
        if not self.dry_run:
            # 1. Upsert law metadata
            try:
                law_payload = {
                    "act_name": act_name,
                    "short_title": act_meta.get("short_title", act_name),
                    "act_number": act_meta.get("act_number"),
                    "year": act_meta.get("year"),
                    "ministry": act_meta.get("ministry"),
                    "category": act_meta.get("category"),
                    "description": act_meta.get("description"),
                    "in_force": act_meta.get("in_force", True),
                    "source_url": act_meta.get("source_url")
                }
                
                # Check if it exists or insert
                existing = self.supabase.table("laws").select("id").eq("act_name", act_name).execute()
                if existing.data:
                    law_id = existing.data[0]["id"]
                    self.supabase.table("laws").update(law_payload).eq("id", law_id).execute()
                    logger.info(f"Updated metadata for existing Law ID: {law_id}")
                else:
                    res = self.supabase.table("laws").insert(law_payload).execute()
                    law_id = res.data[0]["id"]
                    logger.info(f"Created new Law ID: {law_id}")
            except Exception as e:
                logger.error(f"Failed to upsert law metadata: {e}")
                return
        else:
            logger.info(f"[DRY-RUN] Would upsert Law Metadata for '{act_name}'")
            law_id = 999  # Mock ID for dry-run
            
        # 2. Gather all sections for batch embedding
        all_sections = []
        for ch_order, ch in enumerate(chapters_data):
            ch_num = ch.get("chapter_number", "")
            ch_title = ch.get("chapter_title", "General")
            
            for sec in ch.get("sections", []):
                all_sections.append({
                    "chapter_number": ch_num,
                    "chapter_title": ch_title,
                    "chapter_order": ch_order,
                    "section_number": sec["section_number"],
                    "section_title": sec["section_title"],
                    "section_content": sec["section_content"],
                    "keywords": sec.get("keywords", [])
                })
                
        if not all_sections:
            logger.warning(f"No sections found to process for {act_name}")
            return
            
        # 3. Compute Embeddings
        logger.info(f"Generating embeddings for {len(all_sections)} sections...")
        self.lazy_load_embedder()
        contents = [sec["section_content"] for sec in all_sections]
        embeddings = self.embedder.get_embeddings_batch(contents)
        
        # 4. Insert Chapters and Sections
        chapter_cache = {}  # chapter_number -> chapter_id
        
        for idx, sec in enumerate(all_sections):
            ch_num = sec["chapter_number"]
            ch_title = sec["chapter_title"]
            ch_order = sec["chapter_order"]
            
            chapter_id = None
            if not self.dry_run:
                # Cache chapter ID or insert
                cache_key = f"{law_id}_{ch_num}_{ch_title}"
                if cache_key in chapter_cache:
                    chapter_id = chapter_cache[cache_key]
                else:
                    try:
                        # Find or insert chapter
                        ch_existing = self.supabase.table("chapters").select("id").eq("law_id", law_id).eq("chapter_title", ch_title).execute()
                        if ch_existing.data:
                            chapter_id = ch_existing.data[0]["id"]
                        else:
                            ch_res = self.supabase.table("chapters").insert({
                                "law_id": law_id,
                                "chapter_number": ch_num,
                                "chapter_title": ch_title,
                                "sort_order": ch_order
                            }).execute()
                            chapter_id = ch_res.data[0]["id"]
                        chapter_cache[cache_key] = chapter_id
                    except Exception as e:
                        logger.error(f"Failed to upsert chapter '{ch_title}': {e}")
                        continue
            
            # Upsert section
            section_payload = {
                "law_id": law_id,
                "chapter_id": chapter_id,
                "section_number": sec["section_number"],
                "section_title": sec["section_title"],
                "section_content": sec["section_content"],
                "keywords": sec["keywords"],
                "embeddings": embeddings[idx]
            }
            
            if not self.dry_run:
                try:
                    # Check if section number already exists for this law
                    sec_existing = self.supabase.table("sections").select("id").eq("law_id", law_id).eq("section_number", sec["section_number"]).execute()
                    if sec_existing.data:
                        sec_id = sec_existing.data[0]["id"]
                        self.supabase.table("sections").update(section_payload).eq("id", sec_id).execute()
                    else:
                        self.supabase.table("sections").insert(section_payload).execute()
                except Exception as e:
                    logger.error(f"Failed to upsert section {sec['section_number']}: {e}")
            else:
                if idx < 3: # Log first few for verification
                    logger.info(
                        f"[DRY-RUN] Would upsert Section {sec['section_number']}: "
                        f"{sec['section_title']} (Embedding size: {len(embeddings[idx])})"
                    )
                elif idx == 3:
                    logger.info("[DRY-RUN] ... (remaining sections details omitted from log)")

        logger.info(f"Successfully processed {len(all_sections)} sections for '{act_name}'.")

    def run_seeding(self):
        """Seeds the 15 priority acts from seed_laws.py."""
        logger.info("Starting priority acts seeding...")
        
        # Build metadata lookup from SEED_ACTS configuration
        meta_lookup = {meta["act_name"]: meta for meta in SEED_ACTS}
        
        for law in LAW_SEEDS:
            act_name = law["act_name"]
            meta = meta_lookup.get(act_name, {
                "act_name": act_name,
                "short_title": act_name,
                "year": None,
                "ministry": "Unknown",
                "category": "Other",
                "description": ""
            })
            
            self.process_law(meta, law["chapters"])

    def run_scraping(self, single_act: str = None):
        """Scrapes acts from India Code or falls back to Github."""
        scraper = IndiaCodeScraper()
        parser = LegalParser()
        
        acts_to_scrape = [single_act] if single_act else SCRAPE_ACTS
        logger.info(f"Starting scraping for: {acts_to_scrape}")
        
        for act_name in acts_to_scrape:
            # Check if this act name matches one of our priority or scrape registry metadata
            # (or construct empty placeholder)
            act_meta = {
                "act_name": act_name,
                "short_title": act_name.split("Act")[0].strip(),
                "year": int(act_name[-4:]) if act_name[-4:].isdigit() else None,
                "ministry": "Ministry of Law and Justice",
                "category": "Civil",
                "description": f"Indian legislation: {act_name}"
            }
            
            # Scrape act
            scraped = scraper.scrape_act(act_name)
            
            # Extract structures
            parsed_structure = []
            if scraped["parsed_structure"]:
                # If parsed json returned from Github fallback, map it
                # Assumes Github structure is list of chapters, containing sections
                parsed_structure = scraped["parsed_structure"]
            elif scraped["raw_text"]:
                # Parse raw markdown/text
                parsed_structure = parser.parse_act(scraped["raw_text"])
            else:
                # If no text scraped, we write a high-level summary record so the RAG database is at least aware of the act
                logger.warning(f"Could not scrape body for '{act_name}'. Generating summary section fallback...")
                parsed_structure = [
                    {
                        "chapter_number": "I",
                        "chapter_title": "Overview",
                        "sections": [
                            {
                                "section_number": "Act Summary",
                                "section_title": f"About the {act_name}",
                                "section_content": f"The {act_name} is a central legislation of India. Detailed sections are available on the official India Code repository (URL: {scraped['metadata'].get('source_url', 'https://www.indiacode.nic.in')}).",
                                "keywords": ["overview", "summary", act_name.lower()]
                            }
                        ]
                    }
                ]
            
            # Merge any metadata returned from scraper
            act_meta.update(scraped["metadata"])
            
            # Run ingestion
            self.process_law(act_meta, parsed_structure)

    def print_status(self):
        """Fetch and print stats from the database."""
        if self.dry_run:
            logger.info("[DRY-RUN] Cannot fetch database status in dry-run mode.")
            return
            
        try:
            logger.info("Fetching database statistics from Supabase...")
            stats_res = self.supabase.rpc("get_db_stats").execute()
            if stats_res.data:
                stats = stats_res.data[0]
                print("\n==============================================")
                print("LEXAID DATABASE STATUS REPORT")
                print("==============================================")
                print(f"Total Laws Ingested:        {stats.get('total_laws', 0)}")
                print(f"Total Chapters Ingested:    {stats.get('total_chapters', 0)}")
                print(f"Total Sections Ingested:    {stats.get('total_sections', 0)}")
                print(f"Sections with Embeddings:   {stats.get('sections_with_embeddings', 0)}")
                print(f"Categories present:         {stats.get('categories', 'None')}")
                print("==============================================\n")
            else:
                logger.warning("Stats endpoint returned empty response.")
        except Exception as e:
            logger.error(f"Failed to fetch database status: {e}")

    def run_test_search(self, query: str):
        """Execute a test search directly from the Python terminal."""
        logger.info(f"Running test search for query: '{query}'...")
        self.lazy_load_embedder()
        
        # Generate query embedding
        query_emb = self.embedder.get_embedding(query)
        
        if self.dry_run:
            logger.info(f"[DRY-RUN] Successfully generated query embedding (dim: {len(query_emb)}). Database search bypassed.")
            return
            
        try:
            # Call hybrid search RPC
            res = self.supabase.rpc("search_legal_sections", {
                "query_embedding": query_emb,
                "query_text": query,
                "match_count": 3
            }).execute()
            
            print("\n==============================================")
            print(f"SEARCH RESULTS FOR: '{query}'")
            print("==============================================")
            if not res.data:
                print("No relevant sections found above the threshold.")
            for i, match in enumerate(res.data):
                print(f"{i+1}. [{match['act_name']}] {match['section_number']}: {match['section_title']}")
                print(f"   Match Score (hybrid): {match['search_rank']:.4f} (Cosine Sim: {match['similarity']:.4f})")
                print(f"   Snippet: {match['section_content'][:180]}...\n")
            print("==============================================\n")
        except Exception as e:
            logger.error(f"Failed to execute test search: {e}")

def main():
    parser = argparse.ArgumentParser(description="LexAid Legal Database Ingestion CLI")
    parser.add_argument("--seed", action="store_true", help="Seed database with the 15 priority acts")
    parser.add_argument("--scrape", action="store_true", help="Scrape other acts from India Code")
    parser.add_argument("--act", type=str, help="Scrape/ingest a single specific act by name")
    parser.add_argument("--status", action="store_true", help="Show ingestion statistics from Supabase")
    parser.add_argument("--search", type=str, help="Run a test query through hybrid vector search")
    parser.add_argument("--dry-run", action="store_true", help="Run local pipeline processing/embeddings without writing to Supabase")
    
    args = parser.parse_args()
    
    # Load environment variables
    load_dotenv()
    
    # If no flags passed, print help
    if not (args.seed or args.scrape or args.act or args.status or args.search):
        parser.print_help()
        sys.exit(0)
        
    pipeline = LegalIngestionPipeline(dry_run=args.dry_run)
    
    if args.seed:
        pipeline.run_seeding()
        
    if args.act:
        pipeline.run_scraping(single_act=args.act)
    elif args.scrape:
        pipeline.run_scraping()
        
    if args.status:
        pipeline.print_status()
        
    if args.search:
        pipeline.run_test_search(args.search)

if __name__ == "__main__":
    main()
