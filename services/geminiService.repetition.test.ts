import { describe, it, expect } from 'vitest';
import { validateStoryBible } from './geminiService';
import { StoryBible } from '../types';

describe('Story Bible Repetition Detection', () => {
    describe('validateStoryBible', () => {
        it('should detect verbatim logline repetition in characters', () => {
            const badBible: StoryBible = {
                logline: 'A detective investigates a murder',
                characters: 'A detective investigates a murder. He is tough.', // REPETITION
                setting: 'A dark city',
                plotOutline: 'Beginning, middle, end'
            };
            
            const result = validateStoryBible(badBible);
            expect(result.valid).toBe(false);
            expect(result.issues.length).toBeGreaterThan(0);
            expect(result.issues.some(issue => 
                issue.toLowerCase().includes('characters') && issue.toLowerCase().includes('logline')
            )).toBe(true);
        });
        
        it('should accept unique sections with <60% overlap', () => {
            const goodBible: StoryBible = {
                logline: 'A retired cop is pulled back into dangerous territory.',
                characters: '**Detective Noir**: Hardboiled investigator seeking redemption through justice and moral clarity.',
                setting: 'Rain-soaked neo-noir metropolis with neon lights, towering skyscrapers, and urban decay throughout.',
                plotOutline: 'Act I: Discovery of the body at crime scene. Act II: Investigation leads through evidence. Act III: Final confrontation with antagonist.'
            };
            
            const result = validateStoryBible(goodBible);
            expect(result.valid).toBe(true);
            expect(result.issues).toHaveLength(0);
        });
        
        it('should calculate overlap percentage correctly', () => {
            const logline = 'detective investigates murder';
            const characters = 'detective smith investigates the murder case professionally';
            
            // Shared words: detective, investigates, murder (3 out of 3 significant logline words = 100%)
            const bible: StoryBible = {
                logline,
                characters,
                setting: 'City with atmospheric lighting',
                plotOutline: 'Plot with story beats and narrative'
            };
            
            const result = validateStoryBible(bible);
            expect(result.valid).toBe(false);
            expect(result.issues[0]).toMatch(/Characters section repeats \d+%\+ of Logline/); // Should flag >60% overlap
        });
        
        it('should check all sections for minimum length', () => {
            const shortBible: StoryBible = {
                logline: 'Short',
                characters: 'Hero',
                setting: 'Place', // Too short (< 50 chars)
                plotOutline: 'Events'
            };
            
            const result = validateStoryBible(shortBible);
            expect(result.valid).toBe(false);
            expect(result.issues.some(issue => 
                issue.toLowerCase().includes('setting') && issue.toLowerCase().includes('brief')
            )).toBe(true);
        });

        it('should enforce logline length constraints', () => {
            const tooShortLogline: StoryBible = {
                logline: 'Too short',
                characters: 'Character descriptions here',
                setting: 'Setting description here',
                plotOutline: 'Plot outline here'
            };
            
            const result = validateStoryBible(tooShortLogline);
            expect(result.valid).toBe(false);
            expect(result.issues.some(issue => 
                issue.includes('Logline too brief')
            )).toBe(true);
        });

        it('should flag loglines exceeding 160 characters', () => {
            const tooLongLogline: StoryBible = {
                logline: 'A'.repeat(200), // Way too long
                characters: 'Character descriptions here',
                setting: 'Setting description here',
                plotOutline: 'Plot outline here with sufficient length'
            };
            
            const result = validateStoryBible(tooLongLogline);
            expect(result.valid).toBe(false);
            expect(result.issues.some(issue => 
                issue.includes('Logline too long')
            )).toBe(true);
        });

        it('should detect verbatim logline in setting section', () => {
            const bible: StoryBible = {
                logline: 'A detective solves mysteries in the city',
                characters: 'Detective with unique skills',
                setting: 'A detective solves mysteries in the city where neon lights shine', // Contains full logline
                plotOutline: 'Act I: Setup. Act II: Investigation. Act III: Resolution.'
            };
            
            const result = validateStoryBible(bible);
            expect(result.valid).toBe(false);
            expect(result.issues.some(issue => 
                issue.includes('Logline appears verbatim in Setting')
            )).toBe(true);
        });

        it('should detect verbatim logline in plot outline', () => {
            const bible: StoryBible = {
                logline: 'A hero saves the world',
                characters: 'Hero with extraordinary powers',
                setting: 'Futuristic world with advanced technology',
                plotOutline: 'A hero saves the world. Act I: Beginning. Act II: Middle. Act III: End.' // Contains full logline
            };
            
            const result = validateStoryBible(bible);
            expect(result.valid).toBe(false);
            expect(result.issues.some(issue => 
                issue.includes('Logline appears verbatim in Plot Outline')
            )).toBe(true);
        });

        it('should ignore short common words in overlap calculation', () => {
            const bible: StoryBible = {
                logline: 'detective solves mysteries in major urban area', // 'detective', 'solves', 'mysteries', 'major', 'urban', 'area'
                characters: 'Police officer investigates complex situations thoroughly with partners', // 'with' overlaps but low percentage
                setting: 'City environment featuring neon lights and atmospheric elements throughout',
                plotOutline: 'Act I: Beginning of story with setup. Act II: Investigation progresses steadily. Act III: Resolution achieved successfully.'
            };
            
            const result = validateStoryBible(bible);
            // Words >3 chars: detective, solves, mysteries, major, urban, area (6 words)
            // Character overlap: 'with' only (1/6 = 16.7%)
            expect(result.valid).toBe(true); // Overlap should be well under 60%
        });

        it('should handle case-insensitive comparison', () => {
            const bible: StoryBible = {
                logline: 'A DETECTIVE INVESTIGATES MURDER',
                characters: 'detective smith investigates the murder case', // Same words, different case
                setting: 'Dark city with atmosphere',
                plotOutline: 'Plot beats with story structure'
            };
            
            const result = validateStoryBible(bible);
            expect(result.valid).toBe(false); // Should detect overlap despite case difference
        });

        it('should validate plot outline minimum length', () => {
            const shortPlotBible: StoryBible = {
                logline: 'A detective investigates a murder in the rain',
                characters: 'Detective Noir with complex backstory and motivations',
                setting: 'Rain-soaked neo-noir metropolis with atmospheric lighting',
                plotOutline: 'Short plot' // Too short
            };
            
            const result = validateStoryBible(shortPlotBible);
            expect(result.valid).toBe(false);
            expect(result.issues.some(issue => 
                issue.includes('Plot Outline too brief')
            )).toBe(true);
        });

        it('should validate characters minimum length', () => {
            const shortCharsBible: StoryBible = {
                logline: 'A detective investigates a murder in the rain',
                characters: 'Hero', // Too short
                setting: 'Rain-soaked neo-noir metropolis with atmospheric lighting',
                plotOutline: 'Act I: Discovery of crime scene. Act II: Investigation unfolds. Act III: Confrontation.'
            };
            
            const result = validateStoryBible(shortCharsBible);
            expect(result.valid).toBe(false);
            expect(result.issues.some(issue => 
                issue.includes('Characters section too brief')
            )).toBe(true);
        });

        it('should return multiple issues when multiple problems exist', () => {
            const badBible: StoryBible = {
                logline: 'Short', // Too short
                characters: 'Short is the description', // Contains "Short"
                setting: 'X', // Too short
                plotOutline: 'Y' // Too short
            };
            
            const result = validateStoryBible(badBible);
            expect(result.valid).toBe(false);
            expect(result.issues.length).toBeGreaterThan(1); // Multiple issues detected
        });

        it('should validate a well-formed realistic story bible', () => {
            const realisticBible: StoryBible = {
                logline: 'A retired detective is pulled back for one last case that threatens to unravel his past.',
                characters: `**Detective Marcus Cole**: A haunted investigator seeking redemption. Internal conflict between duty and self-preservation.

**The Architect**: Mysterious antagonist with knowledge of Marcus's darkest secrets. Drives the external conflict.

**Sarah Chen**: Forensic analyst who provides crucial evidence. Represents the truth Marcus fears to face.`,
                setting: `Rain-soaked metropolis of Neo-Seattle, 2049. Towering corporate skyscrapers loom over crumbling infrastructure. Neon advertisements reflect in perpetual puddles. Advanced surveillance technology contrasts with forgotten neighborhoods where the case unfolds. Atmosphere of technological progress masking moral decay.`,
                plotOutline: `**Act I - The Call**
Marcus receives news of a murder bearing the signature of a case he buried twenty years ago. The victim's connection to his past forces him out of retirement. Establishing his internal demons and the stakes.

**Act II - The Hunt**
Investigation leads through the city's underbelly. The Architect leaves breadcrumbs that expose Marcus's past mistakes. Allies turn to enemies. Sarah discovers evidence that contradicts Marcus's version of history.

**Act III - The Reckoning**
Confrontation in the abandoned precinct where it all began. Truth emerges: Marcus was complicit in the original crime. Choice between maintaining the lie or accepting responsibility. Resolution brings both justice and personal cost.`
            };
            
            const result = validateStoryBible(realisticBible);
            expect(result.valid).toBe(true);
            expect(result.issues).toHaveLength(0);
        });

        it('should handle punctuation and special characters in overlap detection', () => {
            const bible: StoryBible = {
                logline: 'A detective investigates murder!!!',
                characters: 'Detective Smith investigates, the murder case?',
                setting: 'City with various, atmospheres!',
                plotOutline: 'Plot with story: beats and structure.'
            };
            
            const result = validateStoryBible(bible);
            // Punctuation should be stripped, so overlap is detected
            expect(result.valid).toBe(false);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle empty story bible', () => {
            const emptyBible: StoryBible = {
                logline: '',
                characters: '',
                setting: '',
                plotOutline: ''
            };
            
            const result = validateStoryBible(emptyBible);
            expect(result.valid).toBe(false);
            expect(result.issues.length).toBeGreaterThan(0);
        });

        it('should handle story bible with only whitespace', () => {
            const whitespaceBible: StoryBible = {
                logline: '   ',
                characters: '\n\n',
                setting: '\t\t',
                plotOutline: '    '
            };
            
            const result = validateStoryBible(whitespaceBible);
            expect(result.valid).toBe(false);
        });

        it('should handle unicode and special characters', () => {
            const unicodeBible: StoryBible = {
                logline: 'A détective investigatés a mürdër with émojis 🔍',
                characters: 'Détective with ñoble goals',
                setting: 'City with 中文 characters',
                plotOutline: 'Act I: Начало. Act II: Середина. Act III: Конец.'
            };
            
            expect(() => validateStoryBible(unicodeBible)).not.toThrow();
        });

        it('should not divide by zero when logline is empty', () => {
            const noLoglineBible: StoryBible = {
                logline: '',
                characters: 'Detective with skills',
                setting: 'Atmospheric city',
                plotOutline: 'Plot with structure'
            };
            
            expect(() => validateStoryBible(noLoglineBible)).not.toThrow();
        });
    });

    describe('Validation Thresholds', () => {
        it('should pass with <60% overlap', () => {
            // Create scenario with <60% overlap (2 out of 5 = 40%)
            const bible: StoryBible = {
                logline: 'word1 word2 word3 word4 word5', // 5 words (all >3 chars)
                characters: 'word1 word2 other1 other2 other3 other4 extra1 extra2', // 2/5 = 40% overlap, 53 chars
                setting: 'Completely different setting description here with more detail added',
                plotOutline: 'Plot outline with unique content and sufficient length for validation purposes and comprehensive testing requirements'
            };
            
            const result = validateStoryBible(bible);
            // Implementation checks >60%, so 40% should be valid
            expect(result.valid).toBe(true);
        });

        it('should flag >60% overlap as invalid', () => {
            const bible: StoryBible = {
                logline: 'word1 word2 word3 word4 word5', // 5 words
                characters: 'word1 word2 word3 word4 other1 other2', // 4/5 = 80% overlap
                setting: 'Completely different setting description here',
                plotOutline: 'Plot outline with unique content and sufficient length'
            };
            
            const result = validateStoryBible(bible);
            expect(result.valid).toBe(false);
            expect(result.issues[0]).toMatch(/Characters section repeats \d+%\+ of Logline/);
        });
    });
});
