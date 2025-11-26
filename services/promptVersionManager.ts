/**
 * Prompt Version Manager
 * 
 * Manages versioned prompt templates for consistent, high-quality prompt construction.
 * Supports A/B testing, genre-specific templates, and template evolution tracking.
 * 
 * @module services/promptVersionManager
 */

import { ValidationResult, validationSuccess, validationFailure, createValidationError } from '../types/validation';

/**
 * Prompt template version metadata
 */
export interface PromptTemplateVersion {
    /** Semantic version (e.g., "1.0.0", "1.1.0-beta") */
    version: string;
    /** When this version was created */
    createdAt: number;
    /** Human-readable description of changes */
    changelog?: string;
    /** Whether this is a stable release */
    stable: boolean;
}

/**
 * Quality thresholds for prompt evaluation
 */
export interface QualityThresholds {
    /** Minimum coherence score (0-1) */
    coherenceMin: number;
    /** Minimum diversity entropy */
    diversityEntropyMin: number;
    /** Minimum semantic alignment score (0-1) */
    similarityAlignmentMin: number;
}

/**
 * Prompt template metadata
 */
export interface PromptTemplateMetadata {
    /** Unique template identifier */
    id: string;
    /** Template version */
    version: string;
    /** Genre category */
    genre: string;
    /** Narrative tone */
    tone: string;
    /** Visual density level */
    visualDensity: 'LOW' | 'MEDIUM' | 'HIGH';
    /** Elements that must appear in generated content */
    mandatoryElements: string[];
    /** Supported character archetypes */
    characterArchetypes: string[];
    /** Quality evaluation thresholds */
    qualityThresholds: QualityThresholds;
    /** Template description */
    description?: string;
    /** Template changelog */
    versions?: PromptTemplateVersion[];
}

/**
 * Prompt template with content and metadata
 */
export interface PromptTemplate {
    metadata: PromptTemplateMetadata;
    /** Single-frame instruction prefix */
    singleFramePrefix: string;
    /** Negative prompt base */
    negativePromptBase: string;
    /** Genre-specific style guidance */
    styleGuidance: string;
    /** Character description template */
    characterTemplate: string;
    /** Scene description template */
    sceneTemplate: string;
    /** Transition guidance */
    transitionGuidance: string;
}

/**
 * Template registry manifest
 */
export interface TemplateManifest {
    /** Registry version */
    version: string;
    /** Last updated timestamp */
    lastUpdated: number;
    /** Default template ID */
    defaultTemplateId: string;
    /** Available template IDs */
    templateIds: string[];
    /** Genre to template ID mapping */
    genreMapping: Record<string, string>;
}

// ============================================================================
// Default Templates (Embedded for reliability)
// ============================================================================

/**
 * Default single-frame instruction prefix
 * Prevents multi-panel, split-screen, and collage outputs
 */
export const DEFAULT_SINGLE_FRAME_PREFIX = `SINGLE CONTINUOUS WIDE-ANGLE SHOT: Generate EXACTLY ONE UNIFIED CINEMATIC SCENE showing a SINGLE MOMENT across the ENTIRE 16:9 frame WITHOUT ANY DIVISIONS, REFLECTIONS, OR LAYERED COMPOSITIONS. The scene must feel like a SINGLE PHOTOGRAPH from a movie, not multiple images combined.`;

/**
 * Default negative prompt base with anti-collage terms
 */
export const DEFAULT_NEGATIVE_PROMPT_BASE = `split-screen, multi-panel, grid layout, character sheet, collage, montage, comic strip, storyboard, multiple frames, side-by-side, before and after, comparison, tiled, mosaic, diptych, triptych, reflection, mirror image, picture-in-picture, inset, overlay, watermark, text, caption, label, border, frame within frame`;

/**
 * Built-in template definitions
 */
const BUILT_IN_TEMPLATES: Record<string, PromptTemplate> = {
    'default-cinematic': {
        metadata: {
            id: 'default-cinematic',
            version: '1.0.0',
            genre: 'general',
            tone: 'cinematic',
            visualDensity: 'MEDIUM',
            mandatoryElements: ['16:9 aspect ratio', 'single frame', 'cinematic lighting'],
            characterArchetypes: ['protagonist', 'antagonist', 'mentor', 'ally'],
            qualityThresholds: {
                coherenceMin: 0.7,
                diversityEntropyMin: 2.0,
                similarityAlignmentMin: 0.75,
            },
            description: 'Default cinematic template for general use',
            versions: [
                { version: '1.0.0', createdAt: Date.now(), stable: true, changelog: 'Initial release' }
            ],
        },
        singleFramePrefix: DEFAULT_SINGLE_FRAME_PREFIX,
        negativePromptBase: DEFAULT_NEGATIVE_PROMPT_BASE,
        styleGuidance: 'Cinematic composition with professional lighting, shallow depth of field where appropriate, and attention to visual storytelling.',
        characterTemplate: '{name}, {visualTraits}, positioned {position} in the frame, {action}.',
        sceneTemplate: '{setting}, {timeOfDay}, {atmosphere}. {foregroundElements}. {backgroundElements}.',
        transitionGuidance: 'Maintain visual continuity with previous shot. Match lighting and color grade.',
    },
    'sci-fi-epic': {
        metadata: {
            id: 'sci-fi-epic',
            version: '1.0.0',
            genre: 'sci-fi',
            tone: 'epic',
            visualDensity: 'HIGH',
            mandatoryElements: ['16:9 aspect ratio', 'single frame', 'futuristic elements', 'advanced technology'],
            characterArchetypes: ['explorer', 'scientist', 'rebel', 'AI entity'],
            qualityThresholds: {
                coherenceMin: 0.75,
                diversityEntropyMin: 2.2,
                similarityAlignmentMin: 0.8,
            },
            description: 'Epic science fiction with high visual density',
        },
        singleFramePrefix: DEFAULT_SINGLE_FRAME_PREFIX,
        negativePromptBase: DEFAULT_NEGATIVE_PROMPT_BASE + ', low-tech, medieval, fantasy magic',
        styleGuidance: 'High-tech aesthetic with neon accents, holographic displays, sleek surfaces. Blade Runner meets Interstellar visual language.',
        characterTemplate: '{name}, {visualTraits}, wearing {costume}, interacting with {techElement}.',
        sceneTemplate: '{setting}, illuminated by {lightSource}, featuring {techDetails}. {atmosphericEffects}.',
        transitionGuidance: 'Maintain consistent tech level and color palette (cyan/orange/white).',
    },
    'drama-intimate': {
        metadata: {
            id: 'drama-intimate',
            version: '1.0.0',
            genre: 'drama',
            tone: 'intimate',
            visualDensity: 'LOW',
            mandatoryElements: ['16:9 aspect ratio', 'single frame', 'emotional focus', 'character-driven'],
            characterArchetypes: ['everyman', 'confidant', 'love interest', 'family member'],
            qualityThresholds: {
                coherenceMin: 0.8,
                diversityEntropyMin: 1.5,
                similarityAlignmentMin: 0.85,
            },
            description: 'Character-focused drama with intimate framing',
        },
        singleFramePrefix: DEFAULT_SINGLE_FRAME_PREFIX,
        negativePromptBase: DEFAULT_NEGATIVE_PROMPT_BASE + ', action scene, explosion, superhero, fantasy creature',
        styleGuidance: 'Intimate framing, natural lighting, focus on facial expressions and body language. Subdued color palette.',
        characterTemplate: '{name}, {emotionalState}, {physicalTension}, {eyeline}.',
        sceneTemplate: '{interiorSetting}, {practicalLighting}, {personalObjects}. {emotionalAtmosphere}.',
        transitionGuidance: 'Maintain emotional continuity. Match lighting warmth and character positioning.',
    },
    'thriller-tense': {
        metadata: {
            id: 'thriller-tense',
            version: '1.0.0',
            genre: 'thriller',
            tone: 'tense',
            visualDensity: 'MEDIUM',
            mandatoryElements: ['16:9 aspect ratio', 'single frame', 'tension elements', 'suspense lighting'],
            characterArchetypes: ['investigator', 'suspect', 'victim', 'mastermind'],
            qualityThresholds: {
                coherenceMin: 0.75,
                diversityEntropyMin: 1.8,
                similarityAlignmentMin: 0.8,
            },
            description: 'Suspenseful thriller with tension-building visuals',
        },
        singleFramePrefix: DEFAULT_SINGLE_FRAME_PREFIX,
        negativePromptBase: DEFAULT_NEGATIVE_PROMPT_BASE + ', bright cheerful, cartoon, comedy, sunny day',
        styleGuidance: 'High contrast lighting, deep shadows, uneasy angles. Hitchcock-inspired visual tension.',
        characterTemplate: '{name}, {suspiciousBehavior}, partially {visibility}, {tensionIndicator}.',
        sceneTemplate: '{location}, {shadowPlay}, {hiddenThreat}. {environmentalTension}.',
        transitionGuidance: 'Escalate visual tension. Shadows deepen, framing tightens.',
    },
};

// ============================================================================
// Template Manager
// ============================================================================

/**
 * In-memory template cache
 */
let templateCache: Record<string, PromptTemplate> = { ...BUILT_IN_TEMPLATES };

/**
 * Current manifest
 */
let currentManifest: TemplateManifest = {
    version: '1.0.0',
    lastUpdated: Date.now(),
    defaultTemplateId: 'default-cinematic',
    templateIds: Object.keys(BUILT_IN_TEMPLATES),
    genreMapping: {
        'general': 'default-cinematic',
        'sci-fi': 'sci-fi-epic',
        'drama': 'drama-intimate',
        'thriller': 'thriller-tense',
    },
};

/**
 * Get a prompt template by ID
 * 
 * @param templateId - Template identifier
 * @returns ValidationResult with template or error
 */
export function getTemplate(templateId: string): ValidationResult<PromptTemplate> {
    const template = templateCache[templateId];
    
    if (!template) {
        return validationFailure([
            createValidationError(
                'TEMPLATE_NOT_FOUND',
                `Prompt template "${templateId}" not found`,
                { fix: `Available templates: ${Object.keys(templateCache).join(', ')}` }
            )
        ]);
    }
    
    return validationSuccess(template, `Template "${templateId}" loaded`);
}

/**
 * Get template by genre
 * Falls back to default if genre not mapped
 * 
 * @param genre - Genre identifier
 * @returns ValidationResult with template
 */
export function getTemplateByGenre(genre: string): ValidationResult<PromptTemplate> {
    const templateId = currentManifest.genreMapping[genre.toLowerCase()] 
        || currentManifest.defaultTemplateId;
    
    return getTemplate(templateId);
}

/**
 * Get the default template
 * 
 * @returns ValidationResult with default template
 */
export function getDefaultTemplate(): ValidationResult<PromptTemplate> {
    return getTemplate(currentManifest.defaultTemplateId);
}

/**
 * Get all available template metadata
 * 
 * @returns Array of template metadata
 */
export function getAvailableTemplates(): PromptTemplateMetadata[] {
    return Object.values(templateCache).map(t => t.metadata);
}

/**
 * Get current manifest
 * 
 * @returns Template manifest
 */
export function getManifest(): TemplateManifest {
    return { ...currentManifest };
}

/**
 * Register a custom template
 * 
 * @param template - Template to register
 * @returns ValidationResult indicating success/failure
 */
export function registerTemplate(template: PromptTemplate): ValidationResult {
    if (!template.metadata?.id) {
        return validationFailure([
            createValidationError('INVALID_TEMPLATE', 'Template must have metadata.id')
        ]);
    }
    
    templateCache[template.metadata.id] = template;
    
    if (!currentManifest.templateIds.includes(template.metadata.id)) {
        currentManifest.templateIds.push(template.metadata.id);
    }
    
    // Update genre mapping if this is a new genre
    const genre = template.metadata.genre.toLowerCase();
    if (!currentManifest.genreMapping[genre]) {
        currentManifest.genreMapping[genre] = template.metadata.id;
    }
    
    currentManifest.lastUpdated = Date.now();
    
    return validationSuccess(undefined, `Template "${template.metadata.id}" registered`);
}

/**
 * Apply template to a base prompt
 * Enhances the prompt with template-specific guidance
 * 
 * @param basePrompt - Original prompt text
 * @param templateId - Template to apply (or 'default')
 * @returns Enhanced prompt with template guidance
 */
export function applyTemplate(
    basePrompt: string,
    templateId: string = 'default-cinematic'
): ValidationResult<{ prompt: string; negativePrompt: string }> {
    const templateResult = getTemplate(templateId);
    
    if (!templateResult.success || !templateResult.data) {
        // Fall back to default template
        const defaultResult = getDefaultTemplate();
        if (!defaultResult.success || !defaultResult.data) {
            return validationFailure([
                createValidationError('NO_TEMPLATE', 'No template available')
            ]);
        }
        templateResult.data = defaultResult.data;
    }
    
    const template = templateResult.data;
    
    // Build enhanced prompt
    const enhancedPrompt = `${template.singleFramePrefix}

${basePrompt}

Style guidance: ${template.styleGuidance}`;
    
    return validationSuccess({
        prompt: enhancedPrompt,
        negativePrompt: template.negativePromptBase,
    }, `Applied template "${template.metadata.id}"`);
}

/**
 * Get template version history
 * 
 * @param templateId - Template identifier
 * @returns Array of version metadata or empty array
 */
export function getTemplateVersionHistory(templateId: string): PromptTemplateVersion[] {
    const template = templateCache[templateId];
    return template?.metadata.versions || [];
}

/**
 * Compare two template versions (for A/B testing)
 * 
 * @param templateIdA - First template ID
 * @param templateIdB - Second template ID
 * @returns Comparison result with differences
 */
export function compareTemplates(
    templateIdA: string,
    templateIdB: string
): ValidationResult<{
    differences: string[];
    thresholdComparison: {
        a: QualityThresholds;
        b: QualityThresholds;
    };
}> {
    const resultA = getTemplate(templateIdA);
    const resultB = getTemplate(templateIdB);
    
    if (!resultA.success || !resultA.data) {
        return validationFailure([
            createValidationError('TEMPLATE_A_NOT_FOUND', `Template A "${templateIdA}" not found`)
        ]);
    }
    
    if (!resultB.success || !resultB.data) {
        return validationFailure([
            createValidationError('TEMPLATE_B_NOT_FOUND', `Template B "${templateIdB}" not found`)
        ]);
    }
    
    const a = resultA.data;
    const b = resultB.data;
    const differences: string[] = [];
    
    if (a.metadata.genre !== b.metadata.genre) {
        differences.push(`Genre: ${a.metadata.genre} vs ${b.metadata.genre}`);
    }
    if (a.metadata.tone !== b.metadata.tone) {
        differences.push(`Tone: ${a.metadata.tone} vs ${b.metadata.tone}`);
    }
    if (a.metadata.visualDensity !== b.metadata.visualDensity) {
        differences.push(`Visual density: ${a.metadata.visualDensity} vs ${b.metadata.visualDensity}`);
    }
    if (a.singleFramePrefix !== b.singleFramePrefix) {
        differences.push('Single-frame prefix differs');
    }
    if (a.negativePromptBase !== b.negativePromptBase) {
        differences.push('Negative prompt base differs');
    }
    if (a.styleGuidance !== b.styleGuidance) {
        differences.push('Style guidance differs');
    }
    
    return validationSuccess({
        differences,
        thresholdComparison: {
            a: a.metadata.qualityThresholds,
            b: b.metadata.qualityThresholds,
        },
    }, `Compared ${templateIdA} vs ${templateIdB}: ${differences.length} differences`);
}

/**
 * Reset templates to built-in defaults
 * Useful for testing or recovering from invalid custom templates
 */
export function resetToDefaults(): void {
    templateCache = { ...BUILT_IN_TEMPLATES };
    currentManifest = {
        version: '1.0.0',
        lastUpdated: Date.now(),
        defaultTemplateId: 'default-cinematic',
        templateIds: Object.keys(BUILT_IN_TEMPLATES),
        genreMapping: {
            'general': 'default-cinematic',
            'sci-fi': 'sci-fi-epic',
            'drama': 'drama-intimate',
            'thriller': 'thriller-tense',
        },
    };
}
