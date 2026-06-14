#!/usr/bin/env python3
"""
LexAid Legal Knowledge Base — Parser Module
Cleans raw text and parses laws/acts into structured chapters and sections.
"""

import re
import unicodedata
from typing import List, Dict, Any

class LegalParser:
    @staticmethod
    def clean_text(text: str) -> str:
        """Clean raw text from PDFs or scraped HTML: normalize whitespace, remove headers/footers."""
        if not text:
            return ""
        
        # Normalize Unicode character variations
        text = unicodedata.normalize("NFKC", text)
        
        # Remove running headers and footers (common in India Code PDFs)
        text = re.sub(r'(?i)page\s+\d+\s+of\s+\d+', '', text)
        text = re.sub(r'(?i)the\s+india\s+code', '', text)
        
        # Remove lines that look like page headers or dates (e.g. "[1872 : ACT IX]")
        text = re.sub(r'\[\s*\d{4}\s*:\s*(?:ACT|Act)\s+[A-Za-z0-9]+\s*\]', '', text)
        
        # Normalize whitespace (replace multiple spaces/newlines with a single space/newline)
        text = re.sub(r'[ \t]+', ' ', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        
        return text.strip()

    @staticmethod
    def split_into_chapters(text: str) -> List[Dict[str, Any]]:
        """
        Split an Act's text into chapters.
        Looks for patterns like 'CHAPTER I', 'Chapter 1', 'CHAPTER ONE', 'PART I', etc.
        """
        # Regular expression to match chapter headings
        # Groups: 1 = Chapter word (Chapter/PART), 2 = Number (I, 1, ONE), 3 = Title (optional)
        chapter_regex = re.compile(
            r'(?:^|\n)(CHAPTER|PART)\s+([IVXLCDM\d]+|[A-Z]{3,10})(?:\s*[-.:\n]+|\s+)(.*?)(?=\n(?:CHAPTER|PART)\s+(?:[IVXLCDM\d]+|[A-Z]{3,10})|\Z)',
            re.IGNORECASE | re.DOTALL
        )
        
        chapters = []
        matches = list(chapter_regex.finditer(text))
        
        if not matches:
            # Fallback if no chapters found: treat the whole text as one main chapter
            return [{
                "chapter_number": "I",
                "chapter_title": "General Provisions",
                "content": text
            }]
            
        for i, match in enumerate(matches):
            ch_type = match.group(1).strip()
            ch_num = match.group(2).strip()
            ch_title_raw = match.group(3).strip()
            
            # Extract the actual chapter title from the content block (usually the first line or two)
            lines = ch_title_raw.split('\n')
            title = lines[0].strip() if lines else "Untitled Chapter"
            # Clean up trailing punctuation
            title = re.sub(r'^[-.:\s]+|[-.:\s]+$', '', title)
            
            # The remaining content belongs to this chapter (until the start of next match)
            start_pos = match.start() + len(match.group(0)) - len(ch_title_raw)
            end_pos = matches[i+1].start() if i + 1 < len(matches) else len(text)
            chapter_content = text[start_pos:end_pos].strip()
            
            chapters.append({
                "chapter_number": ch_num,
                "chapter_title": f"{ch_type} {ch_num} - {title}" if title else f"{ch_type} {ch_num}",
                "content": chapter_content
            })
            
        return chapters

    @staticmethod
    def extract_sections(chapter_content: str) -> List[Dict[str, Any]]:
        """
        Extract individual sections from a chapter's content.
        Looks for patterns like 'Section 1.', '1. ', 'Article 14. ', etc.
        """
        # Matches patterns like "Section 1.", "1. ", "Article 12. "
        section_regex = re.compile(
            r'(?:^|\n)(Section|Article|Sec\.)?\s*(\d+[A-Z]?)(?:\s*[-.:\n]|\s+)(.*?)(?=\n(?:Section|Article|Sec\.)?\s*(?:\d+[A-Z]?)(?:\s*[-.:\n]|\s+)|\Z)',
            re.IGNORECASE | re.DOTALL
        )
        
        sections = []
        matches = list(section_regex.finditer(chapter_content))
        
        for i, match in enumerate(matches):
            sec_prefix = match.group(1) or "Section"
            sec_num = match.group(2).strip()
            sec_body = match.group(3).strip()
            
            # Split the section title (usually the first sentence/line) from the content
            lines = sec_body.split('\n')
            first_line = lines[0].strip()
            
            # If the first line is short, it's likely the title
            if len(first_line) < 120 and not first_line.endswith(('.', ';', ',')):
                title = first_line
                content = '\n'.join(lines[1:]).strip()
            else:
                # Otherwise, use the first few words as a title or keep it generic
                words = first_line.split(' ')
                title = ' '.join(words[:5]) + "..." if len(words) > 5 else first_line
                content = sec_body
                
            # If the content is empty, use the body
            if not content:
                content = sec_body
                
            sections.append({
                "section_number": f"{sec_prefix} {sec_num}",
                "section_title": title.strip(' -.:'),
                "section_content": content
            })
            
        return sections

    def parse_act(self, raw_text: str) -> List[Dict[str, Any]]:
        """Full pipeline: clean, split into chapters, and extract sections from each chapter."""
        cleaned = self.clean_text(raw_text)
        chapters = self.split_into_chapters(cleaned)
        
        parsed_chapters = []
        for ch in chapters:
            sections = self.extract_sections(ch["content"])
            if sections:
                parsed_chapters.append({
                    "chapter_number": ch["chapter_number"],
                    "chapter_title": ch["chapter_title"],
                    "sections": sections
                })
                
        return parsed_chapters

# Self test
if __name__ == "__main__":
    test_text = """
    [1872 : ACT IX] THE INDIAN CONTRACT ACT, 1872
    
    CHAPTER I
    OF THE COMMUNICATION, ACCEPTANCE AND REVOCATION OF PROPOSALS
    
    1. Short title. - This Act may be called the Indian Contract Act, 1872.
    It extends to the whole of India.
    
    2. Interpretation-clause. - In this Act the following words and expressions are used in the following senses:
    (a) Offer means a proposal...
    (b) Promise is an accepted proposal...
    
    CHAPTER II
    OF THE VOIDABLE CONTRACTS AND VOID AGREEMENTS
    
    10. What agreements are contracts. - All agreements are contracts if they are made by the free consent of parties...
    """
    
    parser = LegalParser()
    result = parser.parse_act(test_text)
    for c in result:
        print(f"\n--- {c['chapter_title']} ---")
        for s in c['sections']:
            print(f"  {s['section_number']}: {s['section_title']}")
            print(f"    Content: {s['section_content'][:60]}...")
