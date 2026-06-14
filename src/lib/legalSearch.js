import { supabase } from './supabaseClient'

/**
 * Perform a keyword search against the Indian Legal Knowledge Database.
 * Falls back to an empty list if Supabase is not configured or fails.
 * 
 * @param {string} queryText - The user's query
 * @param {object} options - Search options (match_count, filter_category)
 * @returns {Promise<Array>} List of matching legal sections
 */
export async function searchLegalDatabase(queryText, options = {}) {
  const matchCount = options.matchCount || 5
  const filterCategory = options.filterCategory || null

  if (!queryText || !queryText.trim()) {
    return []
  }

  // Check if Supabase client is properly initialized
  if (!supabase) {
    console.warn('Supabase is not configured. Search bypassed.')
    return []
  }

  try {
    console.log(`Searching legal database for: "${queryText}" (Category: ${filterCategory || 'All'})`)
    
    // Call the keyword-only search RPC
    const { data, error } = await supabase.rpc('search_legal_keyword', {
      query_text: queryText,
      match_count: matchCount,
      filter_category: filterCategory === 'Other' ? null : filterCategory
    })

    if (error) {
      console.error('Database RPC error:', error)
      return []
    }

    return data || []
  } catch (err) {
    console.error('Failed to search legal database:', err)
    return []
  }
}

/**
 * Format retrieved sections into a clean text block for injection into AI prompts.
 * 
 * @param {Array} sections - The legal sections retrieved from database
 * @returns {string} Formatted context string
 */
export function formatContextForAI(sections) {
  if (!sections || sections.length === 0) {
    return 'NO SPECIFIC LEGAL CODES RETRIEVED FROM DATABASE. Use general knowledge of the jurisdiction.'
  }

  let context = 'AUTHORITATIVE LEGAL CONTEXT RETRIEVED FROM DATABASE:\n'
  context += 'Use the following sections to answer the query. You MUST cite them in your response.\n\n'

  sections.forEach((sec, idx) => {
    context += `[RESULT ${idx + 1}]\n`
    context += `Act/Law: ${sec.act_name}\n`
    if (sec.chapter_title) {
      context += `Chapter: ${sec.chapter_title}\n`
    }
    context += `Section: ${sec.section_number} - ${sec.section_title || 'Untitled'}\n`
    context += `Content:\n${sec.section_content}\n`
    if (sec.keywords && sec.keywords.length > 0) {
      context += `Keywords: ${sec.keywords.join(', ')}\n`
    }
    context += `--------------------------------------------------\n\n`
  })

  return context
}

/**
 * Formats section references as citation text for the UI.
 * e.g., "Constitution of India Art. 14" or "BNS 2023 Sec. 103"
 * 
 * @param {object} section - Section data object
 * @returns {string} Citation string
 */
export function getSectionCitation(section) {
  if (!section) return ''
  const act = section.act_name || ''
  const num = section.section_number || ''
  
  // Clean up common abbreviations
  let shortAct = act
  if (act.includes('Constitution')) shortAct = 'Constitution'
  else if (act.includes('Bharatiya Nyaya Sanhita')) shortAct = 'BNS 2023'
  else if (act.includes('Bharatiya Nagarik Suraksha')) shortAct = 'BNSS 2023'
  else if (act.includes('Bharatiya Sakshya')) shortAct = 'BSA 2023'
  else if (act.includes('Information Technology Act')) shortAct = 'IT Act'
  else if (act.includes('Consumer Protection Act')) shortAct = 'CPA 2019'
  else if (act.includes('Right to Information Act')) shortAct = 'RTI Act'
  else if (act.includes('Sexual Harassment of Women')) shortAct = 'POSH Act'
  
  return `${shortAct} ${num}`
}
