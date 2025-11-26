/**
 * Story Bible Converter - Utilities for parsing and converting Story Bible formats
 * 
 * Handles:
 * - Parsing markdown character strings to CharacterProfile[]
 * - Converting V1 Story Bible to V2 format
 * - Upgrading legacy data on load
 * 
 * @module services/storyBibleConverter
 */

import {
    StoryBible,
    StoryBibleV2,
    CharacterProfile,
    CharacterAppearance,
    CharacterRelationship,
    PlotScene,
    isStoryBibleV2,
} from '../types';

import { estimateTokens } from './promptRegistry';

// ============================================================================
// Character Profile Parsing
// ============================================================================

/**
 * Role keywords for automatic role detection
 */
const ROLE_KEYWORDS: Record<CharacterProfile['role'], string[]> = {
    protagonist: ['protagonist', 'hero', 'main character', 'lead', 'driven by', 'seeks', 'must'],
    antagonist: ['antagonist', 'villain', 'opposition', 'enemy', 'threatens', 'blocks', 'mastermind'],
    supporting: ['ally', 'mentor', 'friend', 'partner', 'supports', 'helps', 'assists'],
    background: ['minor', 'background', 'secondary', 'side character'],
};

/**
 * Detects character role from description text
 */
function detectRole(text: string): CharacterProfile['role'] {
    const lower = text.toLowerCase();
    
    for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
        if (keywords.some(kw => lower.includes(kw))) {
            return role as CharacterProfile['role'];
        }
    }
    
    return 'supporting'; // Default role
}

/**
 * Extracts appearance hints from description text
 */
function extractAppearanceHints(text: string): Partial<CharacterAppearance> {
    const appearance: Partial<CharacterAppearance> = {};
    const lower = text.toLowerCase();
    
    // Hair patterns
    const hairPatterns = [
        /(?:with\s+)?(\w+(?:\s+\w+)?\s+hair)/i,
        /(bald|balding)/i,
        /hair\s+(?:is\s+)?(\w+)/i,
    ];
    for (const pattern of hairPatterns) {
        const match = text.match(pattern);
        if (match) {
            appearance.hair = match[1] || match[0];
            break;
        }
    }
    
    // Eye patterns
    const eyePatterns = [
        /(\w+(?:\s+\w+)?\s+eyes)/i,
        /eyes\s+(?:are\s+)?(\w+)/i,
    ];
    for (const pattern of eyePatterns) {
        const match = text.match(pattern);
        if (match) {
            appearance.eyes = match[1] || match[0];
            break;
        }
    }
    
    // Age patterns
    const agePatterns = [
        /(\d{1,2})\s*(?:years?\s*old|y\.?o\.?)/i,
        /(?:in\s+(?:his|her|their)\s+)(\w+ies|\w+ties)/i,
        /(young|middle-aged|elderly|old|teen)/i,
    ];
    for (const pattern of agePatterns) {
        const match = text.match(pattern);
        if (match) {
            appearance.age = match[1] || match[0];
            break;
        }
    }
    
    // Build patterns
    const buildPatterns = [
        /(tall|short|average height)/i,
        /(muscular|athletic|slim|slender|stocky|heavy-set)/i,
    ];
    for (const pattern of buildPatterns) {
        const match = text.match(pattern);
        if (match) {
            if (match[0].toLowerCase().includes('tall') || match[0].toLowerCase().includes('short')) {
                appearance.height = match[0];
            } else {
                appearance.build = match[0];
            }
        }
    }
    
    return appearance;
}

/**
 * Extracts personality traits from description text
 */
function extractPersonality(text: string): string[] {
    const traits: string[] = [];
    const lower = text.toLowerCase();
    
    const traitPatterns = [
        /(brave|courageous|fearless)/i,
        /(intelligent|smart|clever|brilliant)/i,
        /(kind|compassionate|caring|gentle)/i,
        /(ruthless|cruel|cold|calculating)/i,
        /(mysterious|enigmatic|secretive)/i,
        /(loyal|faithful|devoted)/i,
        /(cunning|manipulative|scheming)/i,
        /(haunted|troubled|tormented)/i,
        /(determined|driven|focused)/i,
        /(cynical|jaded|world-weary)/i,
    ];
    
    for (const pattern of traitPatterns) {
        const match = text.match(pattern);
        if (match) {
            traits.push(match[1].toLowerCase());
        }
    }
    
    // Limit to 5 traits
    return traits.slice(0, 5);
}

/**
 * Extracts motivations from description text
 */
function extractMotivations(text: string): string[] {
    const motivations: string[] = [];
    const lower = text.toLowerCase();
    
    const motivationPatterns = [
        /seeks?\s+(\w+(?:\s+\w+)?)/i,
        /wants?\s+(?:to\s+)?(\w+(?:\s+\w+)?)/i,
        /driven\s+by\s+(\w+(?:\s+\w+)?)/i,
        /motivated\s+by\s+(\w+(?:\s+\w+)?)/i,
        /goal\s+(?:is\s+)?(?:to\s+)?(\w+(?:\s+\w+)?)/i,
    ];
    
    for (const pattern of motivationPatterns) {
        const match = text.match(pattern);
        if (match) {
            motivations.push(match[1]);
        }
    }
    
    return motivations.slice(0, 3);
}

/**
 * Parses a single character entry from markdown
 */
function parseCharacterEntry(entry: string, index: number): CharacterProfile | null {
    // Try to extract name and description
    // Patterns: **Name**: Description, - Name: Description, # Name\nDescription
    const patterns = [
        /\*\*([^*]+)\*\*[:\s]*([\s\S]+)/,
        /^-\s*([^:]+):\s*([\s\S]+)/,
        /^#+\s*([^\n]+)\n([\s\S]+)/,
        /^([A-Z][^:]+):\s*([\s\S]+)/,
    ];
    
    let name = '';
    let description = '';
    
    for (const pattern of patterns) {
        const match = entry.trim().match(pattern);
        if (match) {
            name = match[1].trim();
            description = match[2].trim();
            break;
        }
    }
    
    if (!name) {
        // Fallback: use first significant word as name
        const words = entry.trim().split(/\s+/);
        const firstCapitalized = words.find(w => /^[A-Z]/.test(w));
        if (firstCapitalized) {
            name = firstCapitalized;
            description = entry.trim();
        } else {
            return null; // Cannot parse
        }
    }
    
    const appearance = extractAppearanceHints(description);
    const personality = extractPersonality(description);
    const motivations = extractMotivations(description);
    const role = detectRole(description);
    
    // Build visual descriptor
    const visualParts: string[] = [];
    if (appearance.hair) visualParts.push(appearance.hair);
    if (appearance.eyes) visualParts.push(appearance.eyes);
    if (appearance.build) visualParts.push(appearance.build);
    if (appearance.height) visualParts.push(appearance.height);
    
    const visualDescriptor = visualParts.length > 0
        ? `${name}, ${visualParts.join(', ')}`
        : `${name}, distinctive appearance`;
    
    return {
        id: `char-${index + 1}`,
        name,
        appearance,
        personality: personality.length > 0 ? personality : ['complex'],
        backstory: description.slice(0, 200), // Limit backstory length
        motivations: motivations.length > 0 ? motivations : ['unclear goal'],
        relationships: [],
        visualDescriptor,
        role,
    };
}

/**
 * Parses markdown character string into CharacterProfile array.
 * 
 * Supports formats:
 * - **Name**: Description
 * - - Name: Description
 * - # Name\n Description
 * 
 * @param markdownCharacters - Markdown-formatted character descriptions
 * @returns Array of parsed CharacterProfile objects
 */
export function parseMarkdownToProfiles(markdownCharacters: string): CharacterProfile[] {
    if (!markdownCharacters || markdownCharacters.trim().length === 0) {
        return [];
    }
    
    const profiles: CharacterProfile[] = [];
    
    // Split by common character delimiters
    const entries = markdownCharacters
        .split(/(?=\*\*[^*]+\*\*:|^-\s+[A-Z]|^#+\s+)/m)
        .map(e => e.trim())
        .filter(e => e.length > 10); // Filter out short fragments
    
    for (let i = 0; i < entries.length; i++) {
        const profile = parseCharacterEntry(entries[i], i);
        if (profile) {
            profiles.push(profile);
        }
    }
    
    return profiles;
}

// ============================================================================
// Plot Scene Parsing
// ============================================================================

/**
 * Parses plot outline markdown into PlotScene array
 */
export function parsePlotOutlineToScenes(plotOutline: string): PlotScene[] {
    if (!plotOutline || plotOutline.trim().length === 0) {
        return [];
    }
    
    const scenes: PlotScene[] = [];
    
    // Split by act markers
    const actPattern = /Act\s*([IiVv123]+)[:\s]*/gi;
    const actSections = plotOutline.split(actPattern);
    
    let currentAct: 1 | 2 | 3 = 1;
    let sceneInAct = 0;
    
    for (let i = 0; i < actSections.length; i++) {
        const section = actSections[i].trim();
        
        // Check if this is an act marker
        const actMatch = section.match(/^[IiVv123]+$/);
        if (actMatch) {
            const actStr = actMatch[0].toUpperCase();
            if (actStr === 'I' || actStr === '1') currentAct = 1;
            else if (actStr === 'II' || actStr === '2') currentAct = 2;
            else if (actStr === 'III' || actStr === '3') currentAct = 3;
            sceneInAct = 0;
            continue;
        }
        
        // Parse scene entries from this act section
        const sceneEntries = section
            .split(/\n[-•]\s*|\n\d+\.\s*/)
            .map(e => e.trim())
            .filter(e => e.length > 20);
        
        for (const entry of sceneEntries) {
            sceneInAct++;
            
            // Extract visual cues (words suggesting visual elements)
            const visualCues: string[] = [];
            const visualPatterns = [
                /(?:in\s+(?:the\s+)?)?(\w+\s+(?:room|office|street|forest|city|building|car|house|night|day|rain|storm|sunset|dawn))/gi,
                /(dramatic|tense|quiet|chaotic|peaceful|dark|bright|shadowy)/gi,
            ];
            for (const pattern of visualPatterns) {
                const matches = entry.match(pattern);
                if (matches) {
                    visualCues.push(...matches.slice(0, 2));
                }
            }
            
            // Extract character arc mentions
            const characterArcs: string[] = [];
            const arcPatterns = [
                /(\w+)'s?\s+(?:journey|arc|transformation|growth|realization)/gi,
                /(\w+)\s+(?:learns|discovers|realizes|confronts|faces)/gi,
            ];
            for (const pattern of arcPatterns) {
                const matches = entry.match(pattern);
                if (matches) {
                    characterArcs.push(...matches.slice(0, 2));
                }
            }
            
            // Detect pacing
            let pacing: PlotScene['pacing'] = 'medium';
            if (/climax|urgent|chase|fight|escape|explosion|confrontation/i.test(entry)) {
                pacing = 'fast';
            } else if (/quiet|reflection|slow|peaceful|meditation|contemplation/i.test(entry)) {
                pacing = 'slow';
            }
            
            scenes.push({
                actNumber: currentAct,
                sceneNumber: sceneInAct,
                summary: entry.slice(0, 200),
                visualCues: visualCues.slice(0, 4),
                characterArcs: characterArcs.slice(0, 2),
                pacing,
            });
        }
    }
    
    return scenes;
}

// ============================================================================
// Story Bible Conversion
// ============================================================================

/**
 * Converts a V1 Story Bible to V2 format.
 * Parses markdown fields into structured data.
 * 
 * @param bible - V1 Story Bible
 * @returns V2 Story Bible with structured profiles and scenes
 */
export function convertToStoryBibleV2(bible: StoryBible): StoryBibleV2 {
    // If already V2, return as-is
    if (isStoryBibleV2(bible)) {
        return bible;
    }
    
    const characterProfiles = parseMarkdownToProfiles(bible.characters);
    const plotScenes = parsePlotOutlineToScenes(bible.plotOutline);
    
    // Calculate token metadata
    const loglineTokens = estimateTokens(bible.logline);
    const charactersTokens = estimateTokens(bible.characters);
    const settingTokens = estimateTokens(bible.setting);
    const plotOutlineTokens = estimateTokens(bible.plotOutline);
    
    return {
        ...bible,
        version: '2.0',
        characterProfiles,
        plotScenes,
        tokenMetadata: {
            loglineTokens,
            charactersTokens,
            settingTokens,
            plotOutlineTokens,
            totalTokens: loglineTokens + charactersTokens + settingTokens + plotOutlineTokens,
            lastUpdated: Date.now(),
        },
    };
}

/**
 * Serializes CharacterProfile array back to markdown string.
 * Used for backward compatibility with V1 consumers.
 */
export function profilesToMarkdown(profiles: CharacterProfile[]): string {
    return profiles.map(profile => {
        const parts = [`**${profile.name}**`];
        
        if (profile.role === 'protagonist') {
            parts.push('(Protagonist)');
        } else if (profile.role === 'antagonist') {
            parts.push('(Antagonist)');
        }
        
        parts.push(':');
        
        // Add backstory
        if (profile.backstory) {
            parts.push(profile.backstory);
        }
        
        // Add motivations
        if (profile.motivations && profile.motivations.length > 0) {
            parts.push(`Driven by ${profile.motivations.join(' and ')}.`);
        }
        
        return parts.join(' ');
    }).join('\n\n');
}

/**
 * Serializes PlotScene array back to markdown plot outline.
 * Used for backward compatibility with V1 consumers.
 */
export function scenesToPlotOutline(scenes: PlotScene[]): string {
    const acts: Record<number, PlotScene[]> = { 1: [], 2: [], 3: [] };
    
    for (const scene of scenes) {
        if (acts[scene.actNumber]) {
            acts[scene.actNumber].push(scene);
        }
    }
    
    const lines: string[] = [];
    
    for (const actNum of [1, 2, 3]) {
        const actScenes = acts[actNum];
        if (actScenes.length === 0) continue;
        
        lines.push(`**Act ${actNum === 1 ? 'I' : actNum === 2 ? 'II' : 'III'}**`);
        
        for (const scene of actScenes) {
            lines.push(`- ${scene.summary}`);
        }
        
        lines.push('');
    }
    
    return lines.join('\n').trim();
}

/**
 * Checks if a Story Bible needs upgrade to V2 format.
 */
export function needsUpgrade(bible: StoryBible): boolean {
    return !isStoryBibleV2(bible);
}

/**
 * Gets upgrade prompt message for user display.
 */
export function getUpgradePrompt(bible: StoryBible): string | null {
    if (!needsUpgrade(bible)) {
        return null;
    }
    
    return `Your story uses the legacy format. Would you like to upgrade to Story Bible V2 for:
• Structured character profiles with visual descriptors
• Organized plot scenes with visual cues
• Better ComfyUI prompt generation

The upgrade is automatic and preserves your existing content.`;
}
