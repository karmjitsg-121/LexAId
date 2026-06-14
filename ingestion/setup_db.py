#!/usr/bin/env python3
"""
LexAid Legal Knowledge Base — Direct Supabase Database Setup
Executes schema.sql and rpc_functions.sql via psycopg2.
"""

import sys
import os
import psycopg2

def run_sql_file(cursor, file_path):
    print(f"Reading SQL file: {file_path}...")
    with open(file_path, "r", encoding="utf-8") as f:
        sql_content = f.read()
    
    # Split queries by semicolon (simplified but handles comments and standard structures)
    # Since our schema.sql has triggers and functions, splitting blindly on semicolon can break trigger bodies.
    # To execute safely in PostgreSQL, we can execute the block as a single command or run it directly.
    # psycopg2 allows executing multi-statement strings in one execute() call!
    try:
        cursor.execute(sql_content)
        print(f"Successfully executed: {file_path}")
    except Exception as e:
        print(f"Error executing {file_path}: {e}")
        raise

def main():
    # Attempting to parse the password from bracket format
    # Connection string provided: postgresql://postgres:[Manju1303*3]@db.nrqwywiomkcqedmblkln.supabase.co:5432/postgres
    base_conn_str = "host=db.nrqwywiomkcqedmblkln.supabase.co port=5432 dbname=postgres user=postgres"
    
    passwords = ["Manju1303*3", "[Manju1303*3]"]
    conn = None
    
    for pwd in passwords:
        try:
            print(f"Attempting connection to Supabase database with password variant...")
            conn = psycopg2.connect(f"{base_conn_str} password={pwd}")
            print("Database connected successfully!")
            break
        except Exception as e:
            print(f"Connection failed with password variant: {e}")
            
    if not conn:
        print("Error: Could not connect to the database with any of the password variants.")
        sys.exit(1)
        
    conn.autocommit = True
    cursor = conn.cursor()
    
    try:
        # Run schema
        run_sql_file(cursor, "database/schema.sql")
        
        # Run RPC functions
        run_sql_file(cursor, "database/rpc_functions.sql")
        
        print("\nAll database tables and RPC functions initialized successfully in Supabase!")
        
    except Exception as e:
        print(f"Database setup failed: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    main()
