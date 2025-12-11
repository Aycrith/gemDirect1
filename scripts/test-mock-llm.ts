
import { generateStoryBlueprint } from '../services/localStoryService.ts';
import { useSettingsStore } from '../services/settingsStore.ts';
import { DEFAULT_LOCAL_GENERATION_SETTINGS } from '../utils/contextConstants.ts';

// Mock window object for getSettings
if (typeof window === 'undefined') {
    (global as any).window = {
        __localGenSettings: {
            ...DEFAULT_LOCAL_GENERATION_SETTINGS,
            useMockLLM: true
        }
    };
}

async function testMockLLM() {
    console.log('Testing Mock LLM...');
    
    // Update store directly just in case
    useSettingsStore.getState().updateSettings({
        ...DEFAULT_LOCAL_GENERATION_SETTINGS,
        useMockLLM: true
    });

    try {
        const result = await generateStoryBlueprint(
            'A space opera',
            'Sci-Fi'
        );

        console.log('Result:', JSON.stringify(result, null, 2));
        
        if (result.logline.startsWith('[MOCK]')) {
            console.log('SUCCESS: Received mock response.');
        } else {
            console.error('FAILURE: Did not receive mock response.');
            process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

testMockLLM();
