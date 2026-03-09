// Response Formatter
// Structure AI responses with fact/inference separation and uncertainty tracking

export interface StructuredAnswer {
  answerType: 'factual' | 'strategic' | 'exploratory'
  
  // Factual answers
  directAnswer?: string
  facts?: Array<{
    statement: string
    value: any
    source: string
    confidence: number
  }>
  
  // Strategic answers
  recommendation?: string
  rationale?: string
  supportingEvidence?: string[]
  risks?: string[]
  
  // Common fields
  uncertainties?: string[]
  dataQualityWarnings?: string[]
  sources: Array<{
    type: string
    recordCount?: number
    confidence?: number
  }>
  confidence: number
}

export function formatFactualAnswer(
  question: string,
  retrievalResult: any
): StructuredAnswer {
  const facts: any[] = []

  // Extract facts from structured data
  if (retrievalResult.structuredData) {
    const data = retrievalResult.structuredData

    if (data.totalCount !== undefined) {
      facts.push({
        statement: `${data.totalCount} campaigns match your criteria`,
        value: data.totalCount,
        source: 'CampaignRecord.count',
        confidence: 0.95,
      })
    }

    if (data.totalSpend !== undefined) {
      facts.push({
        statement: `Total spend: ${data.totalSpendFormatted}`,
        value: data.totalSpend,
        source: 'CampaignRecord.totalValue',
        confidence: 0.9,
      })
    }

    if (data.influencers) {
      facts.push({
        statement: `${data.influencers.length} influencers found`,
        value: data.influencers.length,
        source: 'BrandInfluencer',
        confidence: 0.95,
      })
    }
  }

  const uncertainties: string[] = []
  if (retrievalResult.dataQualityWarnings) {
    uncertainties.push(...retrievalResult.dataQualityWarnings)
  }

  return {
    answerType: 'factual',
    directAnswer: formatDirectAnswer(question, facts, retrievalResult),
    facts,
    uncertainties: uncertainties.length > 0 ? uncertainties : undefined,
    dataQualityWarnings: retrievalResult.dataQualityWarnings,
    sources: retrievalResult.sources,
    confidence: calculateOverallConfidence(facts),
  }
}

export function formatStrategicAnswer(
  question: string,
  retrievalResult: any
): StructuredAnswer {
  // Look for recommendations in semantic results
  const recommendations = retrievalResult.semanticResults?.filter((r: any) => 
    r.recommendation || r.rationale
  ) || []

  if (recommendations.length > 0) {
    const topRec = recommendations[0]
    return {
      answerType: 'strategic',
      recommendation: topRec.recommendation || topRec.title,
      rationale: topRec.rationale || topRec.description,
      supportingEvidence: topRec.basedOn ? [topRec.basedOn] : [],
      risks: topRec.feedback ? [topRec.feedback] : undefined,
      uncertainties: retrievalResult.dataQualityWarnings,
      sources: [{ type: 'strategic_analysis', confidence: 0.7 }],
      confidence: 0.7,
    }
  }

  return {
    answerType: 'strategic',
    directAnswer: "Based on available data, I can provide insights but need more context for a specific recommendation.",
    uncertainties: retrievalResult.dataQualityWarnings,
    sources: retrievalResult.sources,
    confidence: 0.5,
  }
}

function formatDirectAnswer(question: string, facts: any[], retrievalResult: any): string {
  if (facts.length === 0) {
    return "I don't have enough data to answer that question accurately."
  }

  const lowerQ = question.toLowerCase()

  if (lowerQ.includes('how many') || lowerQ.includes('count')) {
    const countFact = facts.find(f => typeof f.value === 'number')
    if (countFact) {
      return countFact.statement
    }
  }

  if (lowerQ.includes('total') || lowerQ.includes('spend') || lowerQ.includes('cost')) {
    const spendFact = facts.find(f => f.source.includes('totalValue') || f.statement.includes('spend'))
    if (spendFact) {
      return spendFact.statement
    }
  }

  if (lowerQ.includes('which') || lowerQ.includes('who')) {
    const listFact = facts.find(f => f.statement.includes('influencers') || f.statement.includes('campaigns'))
    if (listFact) {
      return listFact.statement
    }
  }

  // Default: return first high-confidence fact
  const highConfFact = facts.find(f => f.confidence > 0.8)
  if (highConfFact) {
    return highConfFact.statement
  }

  return facts[0].statement
}

function calculateOverallConfidence(facts: any[]): number {
  if (facts.length === 0) return 0.0
  const avg = facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length
  return Math.round(avg * 100) / 100
}

// Generate human-readable response text
export function generateResponseText(answer: StructuredAnswer): string {
  const parts: string[] = []

  if (answer.answerType === 'factual') {
    if (answer.directAnswer) {
      parts.push(answer.directAnswer)
    }

    if (answer.facts && answer.facts.length > 0 && answer.facts.length > 1) {
      parts.push('\n**Supporting Facts:**')
      answer.facts.forEach(fact => {
        parts.push(`- ${fact.statement} (Source: ${fact.source})`)
      })
    }

    if (answer.uncertainties && answer.uncertainties.length > 0) {
      parts.push('\n**Note on data quality:**')
      answer.uncertainties.forEach(u => parts.push(`- ${u}`))
    }
  } else if (answer.answerType === 'strategic') {
    if (answer.recommendation) {
      parts.push(`**Recommendation:** ${answer.recommendation}`)
    }
    
    if (answer.rationale) {
      parts.push(`\n**Rationale:** ${answer.rationale}`)
    }

    if (answer.supportingEvidence && answer.supportingEvidence.length > 0) {
      parts.push('\n**Supporting Evidence:**')
      answer.supportingEvidence.forEach(e => parts.push(`- ${e}`))
    }

    if (answer.risks && answer.risks.length > 0) {
      parts.push('\n**Considerations:**')
      answer.risks.forEach(r => parts.push(`- ${r}`))
    }
  } else if (answer.directAnswer) {
    parts.push(answer.directAnswer)
  }

  // Always include confidence if not perfect
  if (answer.confidence < 0.95 && answer.confidence > 0) {
    parts.push(`\n*Confidence: ${Math.round(answer.confidence * 100)}%*`)
  }

  return parts.join('\n')
}

// Build context string for AI with retrieved data
export function buildEnhancedContext(retrievalResult: any): string {
  const parts: string[] = []

  if (retrievalResult.structuredData) {
    parts.push('**VERIFIED DATA FROM DATABASE:**')
    parts.push(JSON.stringify(retrievalResult.structuredData, null, 2))
  }

  if (retrievalResult.semanticResults && retrievalResult.semanticResults.length > 0) {
    parts.push('\n**RELEVANT INSIGHTS:**')
    retrievalResult.semanticResults.forEach((insight: any, idx: number) => {
      parts.push(`${idx + 1}. ${insight.title || insight.description}`)
      if (insight.influencerName) parts.push(`   Influencer: ${insight.influencerName}`)
      if (insight.platform) parts.push(`   Platform: ${insight.platform}`)
    })
  }

  if (retrievalResult.dataQualityWarnings && retrievalResult.dataQualityWarnings.length > 0) {
    parts.push('\n**Data quality notes:**')
    retrievalResult.dataQualityWarnings.forEach((w: string) => parts.push(`- ${w}`))
  }

  return parts.join('\n')
}
