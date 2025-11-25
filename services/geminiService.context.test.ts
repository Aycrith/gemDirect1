import { describe, it, expect } from 'vitest';
import { 
    getPrunedContextForLogline, 
    getPrunedContextForSetting,
    getPrunedContextForCharacters,
    getPrunedContextForPlotOutline
} from './geminiService';
import { StoryBible } from '../types';

describe('Context Pruning Functions', () => {
    let fullStoryBible: StoryBible;
    
    beforeEach(() => {
        fullStoryBible = {
            logline: 'A detective investigates a murder in a neon-lit city.',
            characters: `**Detective Noir**: A hardboiled investigator haunted by his past. Seeks redemption through solving cases.

**The Architect**: A cunning mastermind who always stays one step ahead. Motivated by revenge.

**Sarah Chen**: A forensic analyst who provides crucial insights. Values truth above all.`,
            setting: 'Rain-soaked streets of Neo-Tokyo, 2049. Towering skyscrapers cast long shadows over narrow alleys. Neon signs reflect in puddles, creating a kaleidoscope of colors. A city where cutting-edge technology coexists with urban decay.',
            plotOutline: `**Act I - The Call**
The detective receives news of a high-profile murder in the corporate district. Initial investigation reveals cryptic clues pointing to a larger conspiracy.

**Act II - The Hunt**  
Chase sequences through the rain-soaked city. Allies are revealed, enemies emerge. The Architect's pattern becomes clear through a series of carefully orchestrated events.

**Act III - The Confrontation**
Final showdown in an abandoned factory on the city's edge. Truth about the detective's past is revealed, forcing him to confront his demons.`
        };
    });
    
    describe('getPrunedContextForLogline', () => {
        it('should extract only character names and setting hint', () => {
            const pruned = getPrunedContextForLogline(fullStoryBible);
            
            // Should include character names
            expect(pruned).toContain('Detective Noir');
            expect(pruned).toContain('The Architect');
            expect(pruned).toContain('Sarah Chen');
            
            // Should include truncated setting
            expect(pruned).toContain('Rain-soaked streets');
            
            // Should NOT include full plot outline
            expect(pruned).not.toContain('Act I');
            expect(pruned).not.toContain('Act II');
            expect(pruned).not.toContain('abandoned factory');
            
            // Should be under 100 words
            const wordCount = pruned.split(/\s+/).length;
            expect(wordCount).toBeLessThan(100);
        });
        
        it('should reduce token count by at least 80%', () => {
            const fullContext = JSON.stringify(fullStoryBible);
            const prunedContext = getPrunedContextForLogline(fullStoryBible);
            
            const fullTokens = fullContext.split(/\s+/).length;
            const prunedTokens = prunedContext.split(/\s+/).length;
            
            const reduction = ((fullTokens - prunedTokens) / fullTokens) * 100;
            expect(reduction).toBeGreaterThan(80);
        });
        
        it('should handle minimal story bibles gracefully', () => {
            const minimalBible: StoryBible = {
                logline: 'A short story',
                characters: 'Hero',
                setting: 'City',
                plotOutline: 'Beginning, middle, end'
            };
            
            const pruned = getPrunedContextForLogline(minimalBible);
            expect(pruned).toBeTruthy();
            expect(pruned.length).toBeGreaterThan(0);
        });

        it('should limit to 3 character names maximum', () => {
            const manyCharsBible: StoryBible = {
                ...fullStoryBible,
                characters: `**Character 1**: Description 1.
**Character 2**: Description 2.
**Character 3**: Description 3.
**Character 4**: Description 4.
**Character 5**: Description 5.`
            };
            
            const pruned = getPrunedContextForLogline(manyCharsBible);
            const charMatches = pruned.match(/Character \d/g);
            expect(charMatches).toBeTruthy();
            expect(charMatches!.length).toBeLessThanOrEqual(3);
        });
    });
    
    describe('getPrunedContextForSetting', () => {
        it('should extract logline and plot themes', () => {
            const pruned = getPrunedContextForSetting(fullStoryBible);
            
            // Should include logline
            expect(pruned).toContain(fullStoryBible.logline);
            
            // Should include Act I content
            expect(pruned).toContain('detective receives news');
            
            // Should NOT include full character descriptions
            expect(pruned).not.toContain('hardboiled investigator');
            expect(pruned).not.toContain('forensic analyst');
            
            // Should be under 150 words
            const wordCount = pruned.split(/\s+/).length;
            expect(wordCount).toBeLessThan(150);
        });
        
        it('should reduce token count by at least 75%', () => {
            const fullContext = JSON.stringify(fullStoryBible);
            const prunedContext = getPrunedContextForSetting(fullStoryBible);
            
            const fullTokens = fullContext.split(/\s+/).length;
            const prunedTokens = prunedContext.split(/\s+/).length;
            
            const reduction = ((fullTokens - prunedTokens) / fullTokens) * 100;
            expect(reduction).toBeGreaterThan(75);
        });

        it('should handle missing Act structure gracefully', () => {
            const noActBible: StoryBible = {
                ...fullStoryBible,
                plotOutline: 'A simple plot without act structure.'
            };
            
            const pruned = getPrunedContextForSetting(noActBible);
            expect(pruned).toBeTruthy();
            expect(pruned).toContain(noActBible.logline);
        });
    });

    describe('getPrunedContextForCharacters', () => {
        it('should extract logline, setting summary, and Act I', () => {
            const pruned = getPrunedContextForCharacters(fullStoryBible);
            
            // Should include logline
            expect(pruned).toContain(fullStoryBible.logline);
            
            // Should include truncated setting
            expect(pruned).toContain('Rain-soaked streets');
            
            // Should include Act I summary
            expect(pruned).toContain('detective receives');
            
            // Should be under 200 words
            const wordCount = pruned.split(/\s+/).length;
            expect(wordCount).toBeLessThan(200);
        });

        it('should reduce token count by at least 70%', () => {
            const fullContext = JSON.stringify(fullStoryBible);
            const prunedContext = getPrunedContextForCharacters(fullStoryBible);
            
            const fullTokens = fullContext.split(/\s+/).length;
            const prunedTokens = prunedContext.split(/\s+/).length;
            
            const reduction = ((fullTokens - prunedTokens) / fullTokens) * 100;
            expect(reduction).toBeGreaterThan(70);
        });

        it('should truncate long setting descriptions', () => {
            const longSettingBible: StoryBible = {
                ...fullStoryBible,
                setting: 'A'.repeat(500) // Very long setting
            };
            
            const pruned = getPrunedContextForCharacters(longSettingBible);
            expect(pruned.length).toBeLessThan(300); // Should be truncated
        });
    });

    describe('getPrunedContextForPlotOutline', () => {
        it('should extract logline and character roles', () => {
            const pruned = getPrunedContextForPlotOutline(fullStoryBible);
            
            // Should include logline
            expect(pruned).toContain(fullStoryBible.logline);
            
            // Should include character names
            expect(pruned).toContain('Detective Noir');
            
            // Should NOT include full character backstories
            expect(pruned).not.toContain('haunted by his past');
            
            // Should be under 150 words
            const wordCount = pruned.split(/\s+/).length;
            expect(wordCount).toBeLessThan(150);
        });

        it('should reduce token count by at least 75%', () => {
            const fullContext = JSON.stringify(fullStoryBible);
            const prunedContext = getPrunedContextForPlotOutline(fullStoryBible);
            
            const fullTokens = fullContext.split(/\s+/).length;
            const prunedTokens = prunedContext.split(/\s+/).length;
            
            const reduction = ((fullTokens - prunedTokens) / fullTokens) * 100;
            expect(reduction).toBeGreaterThan(75);
        });

        it('should limit character role descriptions to 30 chars', () => {
            const longDescBible: StoryBible = {
                ...fullStoryBible,
                characters: '**Hero**: ' + 'A'.repeat(200) // Very long description
            };
            
            const pruned = getPrunedContextForPlotOutline(longDescBible);
            const heroDesc = pruned.match(/Hero: (.*?)(?:\.|$)/);
            if (heroDesc) {
                expect(heroDesc[1].length).toBeLessThanOrEqual(30);
            }
        });

        it('should limit to 3 characters maximum', () => {
            const manyCharsBible: StoryBible = {
                ...fullStoryBible,
                characters: `**Char1**: Desc1.
**Char2**: Desc2.
**Char3**: Desc3.
**Char4**: Desc4.
**Char5**: Desc5.`
            };
            
            const pruned = getPrunedContextForPlotOutline(manyCharsBible);
            const charCount = (pruned.match(/Char\d/g) || []).length;
            expect(charCount).toBeLessThanOrEqual(3);
        });
    });
    
    describe('Token Usage Validation (All Functions)', () => {
        it('should achieve at least 60% reduction across all pruning functions', () => {
            const fullContext = JSON.stringify(fullStoryBible);
            const fullTokens = fullContext.split(/\s+/).length;
            
            const results = [
                { name: 'Logline', pruned: getPrunedContextForLogline(fullStoryBible) },
                { name: 'Setting', pruned: getPrunedContextForSetting(fullStoryBible) },
                { name: 'Characters', pruned: getPrunedContextForCharacters(fullStoryBible) },
                { name: 'PlotOutline', pruned: getPrunedContextForPlotOutline(fullStoryBible) }
            ];
            
            results.forEach(({ name, pruned }) => {
                const prunedTokens = pruned.split(/\s+/).length;
                const reduction = ((fullTokens - prunedTokens) / fullTokens) * 100;
                
                expect(reduction).toBeGreaterThan(60, 
                    `${name} pruning only achieved ${reduction.toFixed(1)}% reduction (expected >60%)`
                );
            });
        });

        it('should maintain consistent output size regardless of input size', () => {
            const extraLongBible: StoryBible = {
                logline: 'A'.repeat(300),
                characters: 'B'.repeat(1000),
                setting: 'C'.repeat(1000),
                plotOutline: 'D'.repeat(2000)
            };
            
            const loglinePruned = getPrunedContextForLogline(extraLongBible);
            const settingPruned = getPrunedContextForSetting(extraLongBible);
            const charsPruned = getPrunedContextForCharacters(extraLongBible);
            const plotPruned = getPrunedContextForPlotOutline(extraLongBible);
            
            // Should all be under reasonable word counts despite massive input
            expect(loglinePruned.split(/\s+/).length).toBeLessThan(100);
            expect(settingPruned.split(/\s+/).length).toBeLessThan(150);
            expect(charsPruned.split(/\s+/).length).toBeLessThan(200);
            expect(plotPruned.split(/\s+/).length).toBeLessThan(150);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty string fields', () => {
            const emptyBible: StoryBible = {
                logline: '',
                characters: '',
                setting: '',
                plotOutline: ''
            };
            
            expect(() => getPrunedContextForLogline(emptyBible)).not.toThrow();
            expect(() => getPrunedContextForSetting(emptyBible)).not.toThrow();
            expect(() => getPrunedContextForCharacters(emptyBible)).not.toThrow();
            expect(() => getPrunedContextForPlotOutline(emptyBible)).not.toThrow();
        });

        it('should handle malformed markdown in characters', () => {
            const malformedBible: StoryBible = {
                ...fullStoryBible,
                characters: 'Not markdown format, just plain text'
            };
            
            const pruned = getPrunedContextForLogline(malformedBible);
            expect(pruned).toBeTruthy();
            expect(pruned.length).toBeGreaterThan(0);
        });

        it('should handle missing Act structure in plot outline', () => {
            const noActsBible: StoryBible = {
                ...fullStoryBible,
                plotOutline: 'Simple plot with no acts mentioned anywhere.'
            };
            
            const settingPruned = getPrunedContextForSetting(noActsBible);
            expect(settingPruned).toContain(noActsBible.logline);
            
            const charsPruned = getPrunedContextForCharacters(noActsBible);
            expect(charsPruned).toContain(noActsBible.logline);
        });

        it('should handle special characters and unicode', () => {
            const unicodeBible: StoryBible = {
                logline: 'A story with émojis 🎬 and spëcial chàrs',
                characters: '**Héro**: Description with ñ and ü',
                setting: 'City with 中文 characters',
                plotOutline: 'Act I: Start\nAct II: Middle\nAct III: End'
            };
            
            expect(() => getPrunedContextForLogline(unicodeBible)).not.toThrow();
            expect(() => getPrunedContextForSetting(unicodeBible)).not.toThrow();
            expect(() => getPrunedContextForCharacters(unicodeBible)).not.toThrow();
            expect(() => getPrunedContextForPlotOutline(unicodeBible)).not.toThrow();
        });
    });
});
