#!/usr/bin/env python3
"""
LexAid Legal Knowledge Base — Configuration
All act metadata and system settings in one place.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ─── Supabase ──────────────────────────────────────────────────────────────────
SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

# ─── Embedding Model ───────────────────────────────────────────────────────────
EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
EMBEDDING_DIM   = 384
BATCH_SIZE      = 32          # sections per embedding batch
MAX_CONTENT_LEN = 2000        # max chars per section before truncation

# ─── Scraper Settings ──────────────────────────────────────────────────────────
INDIA_CODE_BASE  = "https://www.indiacode.nic.in"
REQUEST_DELAY    = 1.5        # seconds between requests
REQUEST_TIMEOUT  = 30         # seconds
MAX_RETRIES      = 3

# ─── Priority Acts Registry ────────────────────────────────────────────────────
# These are seeded from inline data (no scraping needed)
# Format: { act_name, short_title, year, ministry, category, description }
SEED_ACTS = [
    {
        "act_name": "Constitution of India",
        "short_title": "Constitution",
        "year": 1950,
        "ministry": "Ministry of Law and Justice",
        "category": "Constitutional",
        "description": "The supreme law of India. Establishes the framework of fundamental rights, directive principles, and duties of citizens. All other laws must conform to the Constitution.",
    },
    {
        "act_name": "Bharatiya Nyaya Sanhita 2023",
        "short_title": "BNS 2023",
        "act_number": "Central Act 45 of 2023",
        "year": 2023,
        "ministry": "Ministry of Home Affairs",
        "category": "Criminal",
        "description": "Replaces the Indian Penal Code 1860. Defines criminal offences and prescribes punishments for crimes including murder, theft, rape, cheating, and terrorism.",
    },
    {
        "act_name": "Bharatiya Nagarik Suraksha Sanhita 2023",
        "short_title": "BNSS 2023",
        "act_number": "Central Act 46 of 2023",
        "year": 2023,
        "ministry": "Ministry of Home Affairs",
        "category": "Criminal",
        "description": "Replaces the Code of Criminal Procedure (CrPC) 1973. Governs the procedure for administration of criminal law, including arrest, bail, FIR, trial, and appeal.",
    },
    {
        "act_name": "Bharatiya Sakshya Adhiniyam 2023",
        "short_title": "BSA 2023",
        "act_number": "Central Act 47 of 2023",
        "year": 2023,
        "ministry": "Ministry of Home Affairs",
        "category": "Criminal",
        "description": "Replaces the Indian Evidence Act 1872. Governs the admissibility and relevance of evidence in Indian courts, including electronic evidence.",
    },
    {
        "act_name": "Information Technology Act 2000",
        "short_title": "IT Act",
        "act_number": "Central Act 21 of 2000",
        "year": 2000,
        "ministry": "Ministry of Electronics and Information Technology",
        "category": "Cyber",
        "description": "Provides legal framework for e-commerce and cybercrime. Covers hacking, identity theft, cyber fraud, data breach, online obscenity, and intermediary liability.",
    },
    {
        "act_name": "Consumer Protection Act 2019",
        "short_title": "CPA 2019",
        "act_number": "Central Act 35 of 2019",
        "year": 2019,
        "ministry": "Ministry of Consumer Affairs",
        "category": "Consumer",
        "description": "Protects consumers from unfair trade practices and product defects. Establishes District, State, and National Consumer Commissions for redressal of complaints.",
    },
    {
        "act_name": "Right to Information Act 2005",
        "short_title": "RTI Act",
        "act_number": "Central Act 22 of 2005",
        "year": 2005,
        "ministry": "Ministry of Personnel, Public Grievances and Pensions",
        "category": "Constitutional",
        "description": "Empowers citizens to request information from public authorities. Establishes Public Information Officers (PIOs) and the Central/State Information Commissions.",
    },
    {
        "act_name": "Sexual Harassment of Women at Workplace Act 2013",
        "short_title": "POSH Act",
        "act_number": "Central Act 14 of 2013",
        "year": 2013,
        "ministry": "Ministry of Women and Child Development",
        "category": "Labour",
        "description": "Prohibits sexual harassment of women at the workplace. Mandates formation of Internal Complaints Committee (ICC) in organizations with 10+ employees.",
    },
    {
        "act_name": "Code on Wages 2019",
        "short_title": "Wages Code",
        "act_number": "Central Act 29 of 2019",
        "year": 2019,
        "ministry": "Ministry of Labour and Employment",
        "category": "Labour",
        "description": "Consolidates laws on minimum wages, payment of wages, payment of bonus, and equal remuneration. Applies to all workers in organised and unorganised sectors.",
    },
    {
        "act_name": "Motor Vehicles Act 1988",
        "short_title": "MV Act",
        "act_number": "Central Act 59 of 1988",
        "year": 1988,
        "ministry": "Ministry of Road Transport and Highways",
        "category": "Civil",
        "description": "Regulates all aspects of road transport including licensing, registration, traffic rules, insurance, and compensation for road accident victims.",
    },
    {
        "act_name": "Protection of Children from Sexual Offences Act 2012",
        "short_title": "POCSO Act",
        "act_number": "Central Act 32 of 2012",
        "year": 2012,
        "ministry": "Ministry of Women and Child Development",
        "category": "Criminal",
        "description": "Provides protection to children from sexual assault, sexual harassment, and pornography. Establishes Special Courts for speedy trial of such offences.",
    },
    {
        "act_name": "Scheduled Castes and Scheduled Tribes (Prevention of Atrocities) Act 1989",
        "short_title": "SC/ST Atrocities Act",
        "act_number": "Central Act 33 of 1989",
        "year": 1989,
        "ministry": "Ministry of Social Justice and Empowerment",
        "category": "Criminal",
        "description": "Prevents commission of offences against SC/ST communities. Provides for Special Courts and special provisions for investigation and trial.",
    },
    {
        "act_name": "Hindu Marriage Act 1955",
        "short_title": "HMA 1955",
        "act_number": "Central Act 25 of 1955",
        "year": 1955,
        "ministry": "Ministry of Law and Justice",
        "category": "Family",
        "description": "Governs solemnisation and registration of Hindu marriages. Provides for divorce, judicial separation, maintenance, restitution of conjugal rights, and custody.",
    },
    {
        "act_name": "Transfer of Property Act 1882",
        "short_title": "TPA 1882",
        "act_number": "Central Act 4 of 1882",
        "year": 1882,
        "ministry": "Ministry of Law and Justice",
        "category": "Property",
        "description": "Governs transfer of property by act of parties in India. Covers sale, mortgage, lease, exchange, gift, and actionable claims.",
    },
    {
        "act_name": "Indian Contract Act 1872",
        "short_title": "ICA 1872",
        "act_number": "Central Act 9 of 1872",
        "year": 1872,
        "ministry": "Ministry of Law and Justice",
        "category": "Commercial",
        "description": "Defines the law relating to contracts in India. Covers offer, acceptance, consideration, void agreements, contingent contracts, quasi-contracts, and breach of contract.",
    },
]

# ─── India Code Scrape Targets (additional acts) ──────────────────────────────
# These are scraped from indiacode.nic.in if not in seed data
SCRAPE_ACTS = [
    "Prevention of Corruption Act 1988",
    "Narcotic Drugs and Psychotropic Substances Act 1985",
    "Prevention of Money Laundering Act 2002",
    "Domestic Violence Act 2005",
    "Dowry Prohibition Act 1961",
    "Industrial Disputes Act 1947",
    "Factories Act 1948",
    "Employees Provident Fund Act 1952",
    "Maternity Benefit Act 1961",
    "Environment Protection Act 1986",
    "Income Tax Act 1961",
    "Goods and Services Tax Act 2017",
    "Companies Act 2013",
    "Arbitration and Conciliation Act 1996",
    "Insolvency and Bankruptcy Code 2016",
    "Real Estate (Regulation and Development) Act 2016",
    "Aadhaar Act 2016",
    "Banking Regulation Act 1949",
    "Negotiable Instruments Act 1881",
    "Specific Relief Act 1963",
]
