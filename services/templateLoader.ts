/**
 * Template Loader & Manager
 * 
 * Loads genre-specific prompt templates and applies them to scene generation.
 * Integrates with quality validators (coherence, diversity, similarity).
 * 
 * Browser-compatible: Uses fetch() for loading templates.
 * Templates are served from /docs/prompts/v1.0/
 * 
 * Usage:
 *   const template = await loadTemplate('sci-fi');
 *   const enhancedPrompt = template.apply(userPrompt);
 */

// Browser-compatible: no Node.js imports

export interface TemplateMetadata {
  id: string;
  name: string;
  version: string;
  created: string;
  author: string;
  path: string;
  status: 'active' | 'deprecated' | 'experimental';
  description: string;
  genre: string;
  tone: string;
  visual_density: 'LOW' | 'MEDIUM' | 'HIGH';
  context_length_tokens: number;
  token_limit: number;
  mandatory_elements_count: number;
  mandatory_elements: string[];
  character_archetypes: string[];
  color_palette: string;
  quality_thresholds: {
    coherence_min: number;
    diversity_entropy_min: number;
    similarity_alignment_min: number;
  };
  usage_count: number;
  last_used: string | null;
  notes: string;
}

export interface Template {
  metadata: TemplateMetadata;
  content: string;
  mandatoryElementsGuide: string;
  apply: (userPrompt: string) => string;
}

export interface TemplatesManifest {
  manifest_version: string;
  created_date: string;
  templates: TemplateMetadata[];
  metadata: {
    total_templates: number;
    active_templates: number;
    default_template: string;
    fallback_template: string;
    quality_enforcement: {
      enabled: boolean;
      validators: string[];
      orchestrator: string;
    };
    constraints: {
      max_context_tokens: number;
      max_generated_tokens: number;
      min_quality_coherence: number;
      min_quality_entropy: number;
      min_quality_alignment: number;
    };
  };
  version_history: Array<{
    version: string;
    date: string;
    changes: string;
    templates_added: string[];
  }>;
}

// Cache templates in memory
const templateCache: Map<string, Template> = new Map();
let manifestCache: TemplatesManifest | null = null;

/**
 * Get the templates base URL for fetching
 * In browser: relative path from public root
 * In tests/Node: uses test fixtures or mocks
 */
function getTemplatesBaseUrl(): string {
  // Check for custom path override (useful for testing)
  if (typeof process !== 'undefined' && process.env?.PROMPT_TEMPLATES_DIR) {
    return process.env.PROMPT_TEMPLATES_DIR;
  }
  // Default: relative path for browser fetch
  return '/docs/prompts/v1.0';
}

/**
 * Load templates manifest
 */
export async function loadManifest(): Promise<TemplatesManifest> {
  if (manifestCache) return manifestCache;

  try {
    const manifestUrl = `${getTemplatesBaseUrl()}/TEMPLATES_MANIFEST.json`;
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    manifestCache = await response.json();
    return manifestCache!;
  } catch (error) {
    console.error(`[TemplateLoader] Failed to load manifest: ${error}`);
    throw new Error(`Cannot load templates manifest: ${(error as Error).message}`);
  }
}

/**
 * Load a single template by ID or genre
 */
export async function loadTemplate(genreOrId: string): Promise<Template> {
  const cacheKey = genreOrId.toLowerCase();
  
  // Check cache first
  if (templateCache.has(cacheKey)) {
    return templateCache.get(cacheKey)!;
  }

  try {
    const manifest = await loadManifest();
    
    // Find template metadata
    const metadata = manifest.templates.find(
      t => t.id === cacheKey || t.genre === cacheKey || t.id === `story-${cacheKey}`
    );
    
    if (!metadata) {
      throw new Error(`Template not found: ${genreOrId}. Available: ${manifest.templates.map(t => t.id).join(', ')}`);
    }

    // Load template file via fetch
    const templateUrl = `${getTemplatesBaseUrl()}/${metadata.path}`;
    const response = await fetch(templateUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const content = await response.text();

    // Extract mandatory elements guide
    const mandatoryMatch = content.match(/=== MANDATORY ELEMENTS ===[\s\S]*?(?=\n===|$)/);
    const mandatoryElementsGuide = mandatoryMatch ? mandatoryMatch[0] : '';

    // Create template object
    const template: Template = {
      metadata,
      content,
      mandatoryElementsGuide,
      apply: (userPrompt: string) => applyTemplate(userPrompt, content, metadata)
    };

    // Cache it
    templateCache.set(cacheKey, template);
    
    return template;
  } catch (error) {
    console.error(`[TemplateLoader] Failed to load template '${genreOrId}': ${error}`);
    throw error;
  }
}

/**
 * Apply template to user prompt (enhancement injection)
 */
function applyTemplate(userPrompt: string, templateContent: string, metadata: TemplateMetadata): string {
  // Extract key sections from template
  const sections = parseTemplateSections(templateContent);
  
  // Build enhanced prompt
  const enhanced = [
    `[GENRE: ${metadata.name.toUpperCase()}]`,
    `[TONE: ${metadata.tone}]`,
    `[VISUAL DENSITY: ${metadata.visual_density}]`,
    `[COLOR PALETTE: ${metadata.color_palette}]`,
    '',
    'USER PROMPT:',
    userPrompt,
    '',
    'MANDATORY SCENE ELEMENTS (include at least ' + metadata.mandatory_elements_count + '):',
    metadata.mandatory_elements.map((el, i) => `  ${i + 1}. ${el}`).join('\n'),
    '',
    'CHARACTER ARCHETYPES (choose 1-2):',
    metadata.character_archetypes.map(arch => `  - ${arch}`).join('\n'),
    '',
    'SCENE STRUCTURE:',
    sections.structure || 'Establish (0-20%) → Develop (20-70%) → Resolve (70-100%)',
    '',
    'TONE & PACING:',
    sections.pacing || 'Follow genre conventions',
    '',
    sections.guidelines || ''
  ].filter(line => line !== '').join('\n');

  return enhanced;
}

/**
 * Parse template sections for quick extraction
 */
function parseTemplateSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};

  const extract = (label: string): string => {
    const regex = new RegExp(`=== ${label} ===([\\s\\S]*?)(?=\\n===|$)`);
    const match = content.match(regex);
    return match?.[1]?.trim() ?? '';
  };

  sections.structure = extract('SCENE STRUCTURE');
  sections.pacing = extract('TONE & PACING');
  sections.guidelines = extract('DIALOGUE GUIDANCE');

  return sections;
}

/**
 * List all available templates
 */
export async function listTemplates(): Promise<TemplateMetadata[]> {
  const manifest = await loadManifest();
  return manifest.templates.filter(t => t.status === 'active');
}

/**
 * Get template by ID
 */
export async function getTemplateMetadata(id: string): Promise<TemplateMetadata | undefined> {
  const manifest = await loadManifest();
  return manifest.templates.find(t => t.id === id || t.id === `story-${id}`);
}

/**
 * Validate that template has all required sections
 */
export async function validateTemplate(id: string): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  try {
    const template = await loadTemplate(id);
    const requiredSections = [
      'TONE & PACING',
      'SCENE STRUCTURE',
      'MANDATORY ELEMENTS',
      'PROHIBITED ELEMENTS',
      'CHARACTER ARCHETYPES',
      'DIALOGUE GUIDANCE',
      'USAGE IN PIPELINE'
    ];

    for (const section of requiredSections) {
      if (!template.content.includes(`=== ${section} ===`)) {
        errors.push(`Missing section: ${section}`);
      }
    }

    // Verify metadata
    if (!template.metadata.mandatory_elements.length) {
      errors.push('No mandatory elements defined in metadata');
    }

    if (!template.metadata.character_archetypes.length) {
      errors.push('No character archetypes defined in metadata');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  } catch (error) {
    return {
      valid: false,
      errors: [(error as Error).message]
    };
  }
}

/**
 * Get default template (fallback if genre not found)
 */
export async function getDefaultTemplate(): Promise<Template> {
  const manifest = await loadManifest();
  return loadTemplate(manifest.metadata.default_template);
}

/**
 * Clear template cache (useful for testing)
 */
export function clearCache(): void {
  templateCache.clear();
  manifestCache = null;
}
