import { validateStoryBible } from './services/geminiService.ts';

const testCases = [
    {
        name: 'Short words test',
        bible: {
            logline: 'A detective solves mysteries in major urban area',
            characters: 'Police officer investigates complex situations thoroughly',
            setting: 'City environment with neon lights and atmospheric elements',
            plotOutline: 'Act I: Beginning of story. Act II: Investigation progresses. Act III: Resolution achieved.'
        }
    },
    {
        name: '<60% overlap test',
        bible: {
            logline: 'word1 word2 word3 word4 word5',
            characters: 'word1 word2 other1 other2 other3 other4 extra',
            setting: 'Completely different setting description here',
            plotOutline: 'Plot outline with unique content and sufficient length for validation'
        }
    }
];

testCases.forEach(({ name, bible }) => {
    console.log(`\nTest: ${name}`);
    const result = validateStoryBible(bible);
    console.log('Valid:', result.valid);
    console.log('Issues:', result.issues);
});
