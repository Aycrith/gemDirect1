import json
import os

def generate_script():
    json_path = r'c:\Dev\gemDirect1\localGenSettings.json'
    output_path = r'c:\Dev\gemDirect1\injection_script.js'

    with open(json_path, 'r', encoding='utf-8') as f:
        settings = json.load(f)

    # Validation logic requested by user
    wan_t2i = settings.get('workflowProfiles', {}).get('wan-t2i', {})
    workflow_json = wan_t2i.get('workflowJson', '')
    
    if len(workflow_json) == 0:
        print("Error: wan-t2i workflowJson is empty in the source file!")
    
    # Construct the JS code
    settings_json_str = json.dumps(settings)
    
    js_code = f"""
async () => {{
    const settings = {settings_json_str};

    if (!settings.workflowProfiles['wan-t2i'] || !settings.workflowProfiles['wan-t2i'].workflowJson || settings.workflowProfiles['wan-t2i'].workflowJson.length === 0) {{
        throw new Error("wan-t2i workflowJson is missing or empty");
    }}

    const dbName = 'cinematic-story-db';
    const storeName = 'misc';
    const key = 'gemDirect-settings-store';
    const value = {{ 
        state: {{ 
            ...settings, 
            _hasHydrated: true, 
            _isInitialized: true 
        }}, 
        version: 0 
    }};

    return new Promise((resolve, reject) => {{
        const request = indexedDB.open(dbName);
        
        request.onerror = (event) => reject("Database error: " + event.target.errorCode);

        request.onsuccess = (event) => {{
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains(storeName)) {{
                reject(`Store ${{storeName}} not found. Is the app loaded?`);
                return;
            }}

            const transaction = db.transaction([storeName], "readwrite");
            const store = transaction.objectStore(storeName);
            const putRequest = store.put(value, key);

            putRequest.onerror = (event) => reject("Put error: " + event.target.error);
            putRequest.onsuccess = (event) => resolve("Injection successful");
        }};
    }});
}}
"""
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(js_code)
    
    print(f"Generated {output_path}")

if __name__ == "__main__":
    generate_script()
