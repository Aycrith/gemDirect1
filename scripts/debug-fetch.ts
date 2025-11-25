
const url = 'http://127.0.0.1:8188//system_stats';

async function testFetch(options: any) {
    console.log(`Testing fetch with options:`, options);
    try {
        const response = await fetch(url, options);
        console.log(`Status: ${response.status}`);
        if (!response.ok) {
            console.log('Headers:', Object.fromEntries(response.headers.entries()));
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

async function run() {
    console.log('--- Test 1: Plain ---');
    await testFetch({});

    console.log('\n--- Test 2: mode=cors, credentials=omit ---');
    await testFetch({ mode: 'cors', credentials: 'omit' });

    console.log('\n--- Test 3: User-Agent ---');
    await testFetch({ headers: { 'User-Agent': 'Mozilla/5.0' } });
}

run();
