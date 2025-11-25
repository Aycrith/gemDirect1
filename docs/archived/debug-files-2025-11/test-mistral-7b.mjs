// test-mistral-7b.mjs - Quick validation of Mistral 7B endpoint

const endpoint = 'http://192.168.50.192:1234/v1/chat/completions';
const model = 'mistralai/mistral-7b-instruct-v0.3';

async function testLLM() {
    console.log('Testing Mistral 7B v0.3...\n');
    
    const payload = {
        model: model,
        messages: [
            { role: 'user', content: 'Write a one-sentence sci-fi story idea about a cyborg detective.' }
        ],
        temperature: 0.7,
        max_tokens: 60,
        stream: false
    };
    
    try {
        const startTime = Date.now();
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const error = await response.text();
            console.error('❌ HTTP Error:', response.status);
            console.error(error);
            process.exit(1);
        }
        
        const data = await response.json();
        const duration = Date.now() - startTime;
        
        console.log('✅ SUCCESS!\n');
        console.log('Generated Story:');
        console.log(data.choices[0].message.content);
        console.log('\nMetrics:');
        console.log(`- Tokens: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion = ${data.usage.total_tokens} total`);
        console.log(`- Duration: ${duration}ms`);
        console.log(`- Speed: ${(data.usage.completion_tokens / (duration/1000)).toFixed(1)} tokens/sec`);
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
        process.exit(1);
    }
}

testLLM();
