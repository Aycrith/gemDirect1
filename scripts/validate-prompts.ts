/**
 * validate-prompts.ts
 * Analyzes prompt variance and consistency metrics from E2E run logs
 * 
 * Usage: npx tsx scripts/validate-prompts.ts --run-dir logs/20251122-204600
 */

import fs from 'node:fs/promises';
import path from 'node:path';

interface PromptMetrics {
    count: number;
    lengths: number[];
    avgLength: number;
    minLength: number;
    maxLength: number;
    variance: number;
    stdDev: number;
    coefficientOfVariation: number;
    uniqueWords: Set<string>;
    commonWords: Map<string, number>;
    negativePrompts: string[];
    singleFrameCount: number;
    aspectRatioViolations: number;
    duplicatePhrases: Array<{ prompt: string; duplicates: string[] }>;
}

interface ValidationResult {
    runDir: string;
    timestamp: string;
    totalPrompts: number;
    metrics: PromptMetrics;
    guardrailsActive: boolean;
    issues: Array<{ type: string; message: string; severity: 'error' | 'warning' | 'info' }>;
}

const parseArgs = (): { runDir: string } => {
    const args = process.argv.slice(2);
    let runDir = '';
    
    for (let i = 0; i < args.length; i++) {
        if ((args[i] === '--run-dir' || args[i] === '-d') && args[i + 1]) {
            runDir = path.resolve(args[i + 1]);
            i++;
        }
    }
    
    if (!runDir) {
        console.error('Usage: npx tsx scripts/validate-prompts.ts --run-dir <path>');
        process.exit(1);
    }
    
    return { runDir };
};

const extractPrompts = async (runDir: string): Promise<string[]> => {
    const prompts: string[] = [];
    
    try {
        // Check story.json for prompts
        const storyPath = path.join(runDir, 'story', 'story.json');
        if (await fileExists(storyPath)) {
            const storyData = JSON.parse(await fs.readFile(storyPath, 'utf-8'));
            if (storyData.scenes) {
                storyData.scenes.forEach((scene: any) => {
                    if (scene.prompt) prompts.push(scene.prompt);
                });
            }
        }
        
        // Check for prompt files in keyframes directory
        const keyframesDir = path.join(runDir, 'story', 'keyframes');
        if (await fileExists(keyframesDir)) {
            const files = await fs.readdir(keyframesDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const promptData = JSON.parse(await fs.readFile(path.join(keyframesDir, file), 'utf-8'));
                    if (promptData.prompt) prompts.push(promptData.prompt);
                }
            }
        }
        
        // Parse run-summary.txt for prompts (if they're logged)
        const summaryPath = path.join(runDir, 'run-summary.txt');
        if (await fileExists(summaryPath)) {
            const summary = await fs.readFile(summaryPath, 'utf-8');
            const promptMatches = summary.match(/prompt[:\s]+["']([^"']+)["']/gi);
            if (promptMatches) {
                promptMatches.forEach(match => {
                    const extracted = match.match(/["']([^"']+)["']/);
                    if (extracted && extracted[1]) prompts.push(extracted[1]);
                });
            }
        }
        
    } catch (error) {
        console.warn('Error extracting prompts:', error instanceof Error ? error.message : error);
    }
    
    return [...new Set(prompts)]; // Deduplicate
};

const calculateMetrics = (prompts: string[]): PromptMetrics => {
    const lengths = prompts.map(p => p.length);
    const avgLength = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
    const minLength = Math.min(...lengths);
    const maxLength = Math.max(...lengths);
    
    // Calculate variance and standard deviation
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = (stdDev / avgLength) * 100;
    
    // Word frequency analysis
    const allWords = prompts.flatMap(p => 
        p.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3) // Filter out short words
    );
    
    const uniqueWords = new Set(allWords);
    const commonWords = new Map<string, number>();
    allWords.forEach(word => {
        commonWords.set(word, (commonWords.get(word) || 0) + 1);
    });
    
    // Check for SINGLE_FRAME_PROMPT presence
    const singleFrameCount = prompts.filter(p => 
        /SINGLE_FRAME_PROMPT/i.test(p)
    ).length;
    
    // Check for aspect ratio violations (non-16:9 references)
    const aspectRatioViolations = prompts.filter(p =>
        /\b(4:3|1:1|9:16|21:9|vertical|portrait|square)\b/i.test(p)
    ).length;
    
    // Detect duplicate phrases (3+ consecutive words appearing multiple times)
    const duplicatePhrases: Array<{ prompt: string; duplicates: string[] }> = [];
    prompts.forEach((prompt, idx) => {
        const words = prompt.toLowerCase().split(/\s+/);
        for (let i = 0; i <= words.length - 3; i++) {
            const phrase = words.slice(i, i + 3).join(' ');
            const otherPrompts = prompts.filter((p, pIdx) => 
                pIdx !== idx && p.toLowerCase().includes(phrase)
            );
            if (otherPrompts.length > 0) {
                duplicatePhrases.push({ 
                    prompt: prompt.substring(0, 50) + '...', 
                    duplicates: otherPrompts.map(p => p.substring(0, 50) + '...') 
                });
            }
        }
    });
    
    // Extract negative prompts (look for common negative terms)
    const negativePrompts = prompts.filter(p =>
        /blurry|low-resolution|watermark|bad anatomy|distorted/i.test(p)
    );
    
    return {
        count: prompts.length,
        lengths,
        avgLength: Math.round(avgLength),
        minLength,
        maxLength,
        variance: Math.round(variance),
        stdDev: Math.round(stdDev * 100) / 100,
        coefficientOfVariation: Math.round(coefficientOfVariation * 100) / 100,
        uniqueWords,
        commonWords,
        negativePrompts,
        singleFrameCount,
        aspectRatioViolations,
        duplicatePhrases: duplicatePhrases.slice(0, 5), // Limit to first 5
    };
};

const validateMetrics = (metrics: PromptMetrics): Array<{ type: string; message: string; severity: 'error' | 'warning' | 'info' }> => {
    const issues: Array<{ type: string; message: string; severity: 'error' | 'warning' | 'info' }> = [];
    
    // Check coefficient of variation (target < 30%)
    if (metrics.coefficientOfVariation > 30) {
        issues.push({
            type: 'HIGH_VARIANCE',
            message: `Prompt length variance is ${metrics.coefficientOfVariation.toFixed(2)}% (target: <30%). Prompts vary significantly in length.`,
            severity: 'warning',
        });
    } else {
        issues.push({
            type: 'VARIANCE_OK',
            message: `Prompt length variance is ${metrics.coefficientOfVariation.toFixed(2)}% (target: <30%). ✅`,
            severity: 'info',
        });
    }
    
    // Check for SINGLE_FRAME_PROMPT presence
    if (metrics.singleFrameCount < metrics.count) {
        issues.push({
            type: 'MISSING_SINGLE_FRAME',
            message: `${metrics.count - metrics.singleFrameCount}/${metrics.count} prompts missing SINGLE_FRAME_PROMPT directive.`,
            severity: 'error',
        });
    } else {
        issues.push({
            type: 'SINGLE_FRAME_OK',
            message: `All ${metrics.count} prompts include SINGLE_FRAME_PROMPT directive. ✅`,
            severity: 'info',
        });
    }
    
    // Check for aspect ratio violations
    if (metrics.aspectRatioViolations > 0) {
        issues.push({
            type: 'ASPECT_RATIO_VIOLATION',
            message: `${metrics.aspectRatioViolations}/${metrics.count} prompts contain non-16:9 aspect ratio references.`,
            severity: 'warning',
        });
    }
    
    // Check prompt lengths
    if (metrics.minLength < 100) {
        issues.push({
            type: 'PROMPT_TOO_SHORT',
            message: `Minimum prompt length is ${metrics.minLength} chars (target: 100-2500). Prompts may lack detail.`,
            severity: 'warning',
        });
    }
    
    if (metrics.maxLength > 2500) {
        issues.push({
            type: 'PROMPT_TOO_LONG',
            message: `Maximum prompt length is ${metrics.maxLength} chars (target: 100-2500). Prompts may be truncated.`,
            severity: 'warning',
        });
    }
    
    // Check for duplicate phrases
    if (metrics.duplicatePhrases.length > 0) {
        issues.push({
            type: 'DUPLICATE_PHRASES',
            message: `Found ${metrics.duplicatePhrases.length} instances of duplicate 3-word phrases across prompts.`,
            severity: 'info',
        });
    }
    
    // Check vocabulary diversity
    const wordsPerPrompt = metrics.uniqueWords.size / metrics.count;
    if (wordsPerPrompt < 20) {
        issues.push({
            type: 'LOW_VOCABULARY',
            message: `Average ${wordsPerPrompt.toFixed(1)} unique words per prompt. Consider more descriptive language.`,
            severity: 'info',
        });
    }
    
    return issues;
};

const fileExists = async (filePath: string): Promise<boolean> => {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
};

const main = async () => {
    const { runDir } = parseArgs();
    
    console.log('🔍 Prompt Consistency Validator\n');
    console.log(`Analyzing run directory: ${runDir}\n`);
    
    // Check if directory exists
    if (!(await fileExists(runDir))) {
        console.error(`❌ Error: Run directory not found: ${runDir}`);
        process.exit(1);
    }
    
    // Extract prompts
    const prompts = await extractPrompts(runDir);
    
    if (prompts.length === 0) {
        console.warn('⚠️  No prompts found in run directory.');
        console.log('   Expected locations:');
        console.log('   - story/story.json');
        console.log('   - story/keyframes/*.json');
        console.log('   - run-summary.txt');
        process.exit(0);
    }
    
    console.log(`Found ${prompts.length} prompts\n`);
    
    // Calculate metrics
    const metrics = calculateMetrics(prompts);
    
    // Validate metrics
    const issues = validateMetrics(metrics);
    
    // Build result
    const result: ValidationResult = {
        runDir,
        timestamp: new Date().toISOString(),
        totalPrompts: prompts.length,
        metrics,
        guardrailsActive: metrics.singleFrameCount === metrics.count,
        issues,
    };
    
    // Display results
    console.log('📊 Prompt Statistics:');
    console.log(`   Total Prompts: ${metrics.count}`);
    console.log(`   Length Range: ${metrics.minLength}-${metrics.maxLength} chars`);
    console.log(`   Average Length: ${metrics.avgLength} chars`);
    console.log(`   Standard Deviation: ${metrics.stdDev} chars`);
    console.log(`   Coefficient of Variation: ${metrics.coefficientOfVariation}%`);
    console.log(`   Unique Words: ${metrics.uniqueWords.size}`);
    console.log(`   Words per Prompt: ${(metrics.uniqueWords.size / metrics.count).toFixed(1)}`);
    console.log();
    
    console.log('🛡️  Guardrail Compliance:');
    console.log(`   SINGLE_FRAME_PROMPT: ${metrics.singleFrameCount}/${metrics.count} (${((metrics.singleFrameCount / metrics.count) * 100).toFixed(1)}%)`);
    console.log(`   Aspect Ratio Violations: ${metrics.aspectRatioViolations}`);
    console.log(`   Duplicate Phrases: ${metrics.duplicatePhrases.length > 0 ? metrics.duplicatePhrases.length : 'None'}`);
    console.log();
    
    // Display top common words
    const topWords = Array.from(metrics.commonWords.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    if (topWords.length > 0) {
        console.log('🔤 Most Common Words:');
        topWords.forEach(([word, count], idx) => {
            console.log(`   ${idx + 1}. "${word}" (${count} times)`);
        });
        console.log();
    }
    
    // Display issues
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    const infos = issues.filter(i => i.severity === 'info');
    
    if (errors.length > 0) {
        console.log('❌ Errors:');
        errors.forEach(issue => {
            console.log(`   - [${issue.type}] ${issue.message}`);
        });
        console.log();
    }
    
    if (warnings.length > 0) {
        console.log('⚠️  Warnings:');
        warnings.forEach(issue => {
            console.log(`   - [${issue.type}] ${issue.message}`);
        });
        console.log();
    }
    
    if (infos.length > 0) {
        console.log('ℹ️  Info:');
        infos.forEach(issue => {
            console.log(`   - [${issue.type}] ${issue.message}`);
        });
        console.log();
    }
    
    // Save results
    const resultPath = path.join(runDir, 'prompt-validation-report.json');
    await fs.writeFile(
        resultPath,
        JSON.stringify({
            ...result,
            metrics: {
                ...result.metrics,
                uniqueWords: Array.from(result.metrics.uniqueWords),
                commonWords: Object.fromEntries(result.metrics.commonWords),
            },
        }, null, 2)
    );
    
    console.log(`📄 Report saved: ${resultPath}\n`);
    
    // Exit with appropriate code
    if (errors.length > 0) {
        console.log('❌ Validation FAILED (errors detected)');
        process.exit(1);
    } else if (warnings.length > 0) {
        console.log('⚠️  Validation PASSED with warnings');
        process.exit(0);
    } else {
        console.log('✅ Validation PASSED');
        process.exit(0);
    }
};

main().catch((error) => {
    console.error('Fatal error:', error instanceof Error ? error.message : error);
    process.exit(1);
});
