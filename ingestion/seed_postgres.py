#!/usr/bin/env python3
"""
LexAid Legal Knowledge Base — Direct Seeding script
Seeds priority acts directly using PostgreSQL superuser connection.
"""

import sys
import psycopg2
from ingestion.seed_laws import LAW_SEEDS
from ingestion.config import SEED_ACTS
from ingestion.embedder import LegalEmbedder

def main():
    db_conn_str = "host=db.nrqwywiomkcqedmblkln.supabase.co port=5432 dbname=postgres user=postgres password=Manju1303*3"
    
    print("Connecting to database...")
    try:
        conn = psycopg2.connect(db_conn_str)
        conn.autocommit = True
        cursor = conn.cursor()
        print("Connected successfully!")
    except Exception as e:
        print(f"Failed to connect to database: {e}")
        sys.exit(1)

    print("Initializing embedding model...")
    embedder = LegalEmbedder()
    
    # Registry lookup for descriptions/years
    meta_lookup = {meta["act_name"]: meta for meta in SEED_ACTS}
    
    for law_seed in LAW_SEEDS:
        act_name = law_seed["act_name"]
        print(f"\n--- Seeding Act: {act_name} ---")
        
        meta = meta_lookup.get(act_name, {
            "act_name": act_name,
            "short_title": act_name,
            "year": 2023,
            "ministry": "Unknown",
            "category": "Other",
            "description": ""
        })
        
        # 1. Upsert law
        cursor.execute(
            """
            INSERT INTO laws (act_name, short_title, act_number, year, ministry, category, description)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (act_name, year) DO UPDATE 
            SET short_title = EXCLUDED.short_title,
                act_number = EXCLUDED.act_number,
                ministry = EXCLUDED.ministry,
                category = EXCLUDED.category,
                description = EXCLUDED.description
            RETURNING id;
            """,
            (
                act_name,
                meta.get("short_title"),
                meta.get("act_number"),
                meta.get("year"),
                meta.get("ministry"),
                meta.get("category"),
                meta.get("description")
            )
        )
        law_id = cursor.fetchone()[0]
        print(f"Law registered: ID {law_id}")
        
        # Gather all sections in this law for batch embedding
        flat_sections = []
        for ch_order, ch in enumerate(law_seed["chapters"]):
            ch_num = ch.get("chapter_number", "")
            ch_title = ch.get("chapter_title", "General")
            
            # Upsert chapter
            cursor.execute(
                """
                INSERT INTO chapters (law_id, chapter_number, chapter_title, sort_order)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT DO NOTHING;
                """
                , (law_id, ch_num, ch_title, ch_order)
            )
            
            # Fetch chapter ID
            cursor.execute(
                "SELECT id FROM chapters WHERE law_id = %s AND chapter_title = %s LIMIT 1;",
                (law_id, ch_title)
            )
            chapter_id = cursor.fetchone()[0]
            
            for sec in ch.get("sections", []):
                flat_sections.append({
                    "chapter_id": chapter_id,
                    "section_number": sec["section_number"],
                    "section_title": sec["section_title"],
                    "section_content": sec["section_content"],
                    "keywords": sec.get("keywords", [])
                })
                
        if not flat_sections:
            print(f"No sections found for {act_name}.")
            continue
            
        # 2. Batch generate embeddings
        contents = [s["section_content"] for s in flat_sections]
        print(f"Computing embeddings for {len(contents)} sections...")
        embeddings = embedder.get_embeddings_batch(contents)
        
        # 3. Insert sections
        print("Uploading sections and embeddings...")
        inserted_count = 0
        for idx, sec in enumerate(flat_sections):
            # Format vector as postgres vector string: '[v1, v2, ...]'
            vector_str = f"[{','.join(map(str, embeddings[idx]))}]"
            
            try:
                cursor.execute(
                    """
                    INSERT INTO sections (law_id, chapter_id, section_number, section_title, section_content, keywords, embeddings)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (law_id, section_number) DO UPDATE
                    SET section_title = EXCLUDED.section_title,
                        section_content = EXCLUDED.section_content,
                        keywords = EXCLUDED.keywords,
                        embeddings = EXCLUDED.embeddings;
                    """,
                    (
                        law_id,
                        sec["chapter_id"],
                        sec["section_number"],
                        sec["section_title"],
                        sec["section_content"],
                        sec["keywords"],
                        vector_str
                    )
                )
                inserted_count += 1
            except Exception as e:
                print(f"Error inserting section {sec['section_number']}: {e}")
                
        print(f"Completed seeding {inserted_count} sections for '{act_name}'.")

    cursor.close()
    conn.close()
    print("\nDatabase seeding completed successfully!")

if __name__ == "__main__":
    main()
