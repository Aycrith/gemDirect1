#!/usr/bin/env node
/**
 * Quick test of Mistral Nemo story generation
 */

const testStoryGeneration = async () => {
  console.log('🧪 Testing Mistral Nemo Story Generation...\n');

  const requestBody = {
    model: 'mistralai/mistral-nemo-instruct-2407',
    messages: [
      {
        role: 'system',
        content: 'You are a creative screenwriter. Generate a compelling story logline.'
      },
      {
        role: 'user',
        content: 'Write a one-sentence logline for a cyberpunk detective story about AI-generated memories being sold on the black market.'
      }
    ],
    temperature: 0.75,
    max_tokens: 100
  };

  try {
    const startTime = Date.now();
    const response = await fetch('http://192.168.50.192:1234/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    
    console.log('✅ SUCCESS!\n');
    console.log('📝 Generated Logline:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(data.choices[0].message.content);
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('📊 Metrics:');
    console.log(`  • Model: ${data.model}`);
    console.log(`  • Tokens: ${data.usage.total_tokens} (prompt: ${data.usage.prompt_tokens}, completion: ${data.usage.completion_tokens})`);
    console.log(`  • Duration: ${duration}ms`);
    console.log(`  • Speed: ${(data.usage.completion_tokens / (duration / 1000)).toFixed(1)} tokens/sec`);
    
    console.log('\n✅ Mistral Nemo is working correctly!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ FAILED:', error.message);
    process.exit(1);
  }
};

testStoryGeneration();
