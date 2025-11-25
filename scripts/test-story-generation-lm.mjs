/**
 * Quick validation test for LM Studio story generation with single user message
 * Run with: node --loader ts-node/esm scripts/test-story-generation-lm.mjs
 */

const testStoryGeneration = async () => {
  console.log('=== Testing LM Studio Story Generation ===\n');

  const providerUrl = process.env.LOCAL_STORY_PROVIDER_URL || 'http://192.168.50.192:1234/v1/chat/completions';
  const model = process.env.LOCAL_LLM_MODEL || 'mistralai/mistral-7b-instruct-v0.3';
  
  console.log(`Provider: ${providerUrl}`);
  console.log(`Model: ${model}\n`);

  const systemInstructions = 'You are the gemDirect1 narrative designer. Return strict JSON with keys logline, characters, setting, plotOutline. Output JSON only with no surrounding prose or markdown fences.';
  
  const userContent = 'Idea: A cyberpunk hacker discovers a corporate surveillance system\nGenre: sci-fi\nReturn JSON only. Limit logline to 140 characters.';
  
  // Combine system + user into single user message (Mistral v0.3 requirement)
  const combinedMessage = `${systemInstructions}\n\n${userContent}`;

  const requestBody = {
    model,
    temperature: 0.35,
    max_tokens: 800,
    messages: [
      { role: 'user', content: combinedMessage }
    ],
    stream: false,
    seed: 42
  };

  console.log('[1/2] Sending request to LM Studio...');
  const startTime = Date.now();

  try {
    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LM Studio returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ Response received in ${duration}s`);
    console.log(`   Prompt tokens: ${data.usage.prompt_tokens}`);
    console.log(`   Completion tokens: ${data.usage.completion_tokens}\n`);

    const content = data.choices[0].message.content;
    
    console.log('[2/2] Parsing JSON response...');
    
    // Strip markdown fences if present
    const cleanContent = content.replace(/```(?:json)?\n?/gi, '').trim();
    const firstBrace = cleanContent.indexOf('{');
    const lastBrace = cleanContent.lastIndexOf('}');
    
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const jsonText = cleanContent.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonText);
      
      console.log('✅ JSON parsed successfully\n');
      console.log('Story Bible:');
      console.log(`  Logline: ${parsed.logline || '(missing)'}`);
      const chars = String(parsed.characters || '(missing)');
      const setting = String(parsed.setting || '(missing)');
      const plot = String(parsed.plotOutline || '(missing)');
      console.log(`  Characters: ${chars.substring(0, 80)}...`);
      console.log(`  Setting: ${setting.substring(0, 80)}...`);
      console.log(`  Plot: ${plot.substring(0, 80)}...\n`);
      
      console.log('=== Test Passed ===');
      console.log('✅ LM Studio integration working correctly');
      console.log('✅ Single user message format accepted');
      console.log('✅ JSON response generated and parsed');
      
      process.exit(0);
    } else {
      throw new Error('No JSON structure found in response');
    }
  } catch (error) {
    console.error(`\n❌ Test Failed: ${error.message}\n`);
    if (error.cause) {
      console.error(`Cause: ${error.cause}`);
    }
    process.exit(1);
  }
};

testStoryGeneration();
