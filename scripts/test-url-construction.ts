// Quick test to verify URL construction logic
const testUrls = [
    'http://192.168.50.192:1234/v1/chat/completions',
    'http://192.168.50.192:1234',
    'http://192.168.50.192:1234/',
    'http://192.168.50.192:1234/v1',
    'http://192.168.50.192:1234/v1/',
];

function constructModelsEndpoint(url: string): string {
    let baseUrl = url;
    if (baseUrl.includes('/v1/chat/completions')) {
        baseUrl = baseUrl.replace(/\/v1\/chat\/completions.*$/, '');
    } else if (baseUrl.endsWith('/v1') || baseUrl.endsWith('/v1/')) {
        baseUrl = baseUrl.replace(/\/v1\/?$/, '');
    } else if (baseUrl.includes('/v1/')) {
        baseUrl = baseUrl.replace(/\/v1\/.*$/, '');
    } else if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1);
    }
    return `${baseUrl}/v1/models`;
}

console.log('Testing URL construction logic:\n');
testUrls.forEach(url => {
    const result = constructModelsEndpoint(url);
    console.log(`Input:  ${url}`);
    console.log(`Output: ${result}`);
    console.log(`✓ Expected: http://192.168.50.192:1234/v1/models\n`);
});
