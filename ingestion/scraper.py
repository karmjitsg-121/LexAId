#!/usr/bin/env python3
"""
LexAid Legal Knowledge Base — Scraper Module
Scrapes Central Acts from indiacode.nic.in or falls back to community GitHub JSONs.
"""

import time
import urllib.parse
import logging
import requests
from bs4 import BeautifulSoup
from tenacity import retry, stop_after_attempt, wait_exponential
from ingestion.config import REQUEST_DELAY, REQUEST_TIMEOUT, INDIA_CODE_BASE

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

class IndiaCodeScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })

    def polite_delay(self):
        """Respectful delay between scraper requests."""
        time.sleep(REQUEST_DELAY)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    def search_act(self, act_name: str) -> str:
        """Search India Code for an Act and return its handle URL if found."""
        self.polite_delay()
        query = urllib.parse.quote(act_name)
        search_url = f"{INDIA_CODE_BASE}/simple-search?query={query}"
        
        logger.info(f"Searching India Code for: '{act_name}'...")
        response = self.session.get(search_url, timeout=REQUEST_TIMEOUT)
        if response.status_code != 200:
            logger.warning(f"Failed to search India Code (HTTP {response.status_code})")
            return ""

        soup = BeautifulSoup(response.text, "lxml")
        # Find results table
        table = soup.find("table", {"class": "table-striped"}) or soup.find("table", {"class": "table"})
        if not table:
            logger.warning(f"No search results table found for '{act_name}'")
            return ""

        # Find first result row with a handle link
        for link in table.find_all("a"):
            href = link.get("href", "")
            if "/handle/" in href:
                handle_url = f"{INDIA_CODE_BASE}{href}"
                logger.info(f"Found handle URL for '{act_name}': {handle_url}")
                return handle_url

        logger.warning(f"No handle link found in search results for '{act_name}'")
        return ""

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    def get_act_details_and_pdf(self, handle_url: str) -> dict:
        """Extract metadata and PDF download link from an India Code handle page."""
        self.polite_delay()
        logger.info(f"Retrieving handle details from: {handle_url}...")
        response = self.session.get(handle_url, timeout=REQUEST_TIMEOUT)
        if response.status_code != 200:
            logger.warning(f"Failed to load handle page (HTTP {response.status_code})")
            return {}

        soup = BeautifulSoup(response.text, "lxml")
        details = {
            "source_url": handle_url,
            "pdf_url": "",
            "year": None,
            "act_number": "",
            "ministry": "",
            "enacted_on": None
        }

        # Look for metadata table rows
        for row in soup.find_all("tr"):
            cells = [c.text.strip() for c in row.find_all(["td", "th"])]
            if len(cells) >= 2:
                key, val = cells[0].lower(), cells[1]
                if "act no" in key or "act number" in key:
                    details["act_number"] = val
                elif "ministry" in key or "department" in key:
                    details["ministry"] = val
                elif "act year" in key or "year" in key:
                    try:
                        details["year"] = int(val)
                    except ValueError:
                        pass

        # Look for PDF attachment link
        for link in soup.find_all("a"):
            href = link.get("href", "")
            if "/bitstream/" in href and href.endswith(".pdf"):
                details["pdf_url"] = f"{INDIA_CODE_BASE}{href}"
                logger.info(f"Found PDF link: {details['pdf_url']}")
                break

        return details

    def fetch_github_fallback(self, act_name: str) -> dict:
        """
        Fallback to fetching structured law text from public civictech repositories on GitHub.
        Specifically looks for community JSON/Markdown representations.
        """
        # Formulate a safe slug for the repo search
        slug = act_name.lower().replace(" ", "-").replace("'", "").replace(",", "")
        
        # Look in known repositories (e.g., civictech-india laws)
        fallback_urls = [
            f"https://raw.githubusercontent.com/civictech-india/laws-in-india/master/json/{slug}.json",
            f"https://raw.githubusercontent.com/civictech-india/laws-in-india/master/markdown/{slug}.md"
        ]
        
        for url in fallback_urls:
            try:
                logger.info(f"Trying community GitHub fallback: {url}...")
                response = self.session.get(url, timeout=15)
                if response.status_code == 200:
                    logger.info(f"Successfully retrieved act content from GitHub fallback.")
                    if url.endswith(".json"):
                        return {"type": "json", "data": response.json()}
                    else:
                        return {"type": "markdown", "data": response.text}
            except Exception as e:
                logger.warning(f"Failed to fetch from {url}: {e}")
                
        return {}

    def scrape_act(self, act_name: str) -> dict:
        """Orchestrate search, detail extraction, and fallbacks for a given Act."""
        result = {
            "act_name": act_name,
            "metadata": {},
            "raw_text": "",
            "parsed_structure": []
        }
        
        # 1. Search India Code
        handle_url = self.search_act(act_name)
        if handle_url:
            details = self.get_act_details_and_pdf(handle_url)
            result["metadata"].update(details)
            
        # 2. Try Github fallback if no PDF/HTML found or to get pre-parsed data
        github_data = self.fetch_github_fallback(act_name)
        if github_data:
            if github_data["type"] == "json":
                result["parsed_structure"] = github_data["data"]
            else:
                result["raw_text"] = github_data["data"]
                
        return result

if __name__ == "__main__":
    scraper = IndiaCodeScraper()
    # Test searching for POSH Act
    url = scraper.search_act("Sexual Harassment of Women at Workplace Act 2013")
    if url:
        details = scraper.get_act_details_and_pdf(url)
        print(f"Details found: {details}")
