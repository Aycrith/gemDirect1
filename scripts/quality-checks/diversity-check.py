#!/usr/bin/env python3
"""
Diversity Check: Thematic diversity measurement using entropy.

Calculates Shannon entropy over thematic tags extracted from scenes.
Higher entropy = more diverse themes.

Exit codes:
- 0: Diversity entropy meets threshold (>=2.0)
- 1: Entropy below threshold
- 2: Setup failed
"""

import json
import sys
import math
from pathlib import Path
from typing import Optional, List, Dict
from collections import Counter

def load_metadata(metadata_path: str) -> Optional[dict]:
    """Load artifact-metadata.json."""
    try:
        with open(metadata_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"[ERROR] Failed to load metadata: {e}")
        return None

def extract_themes(text: str) -> List[str]:
    """
    Extract thematic tags from scene text.
    
    Simplified keyword-based extraction:
    - "action", "fight", "chase" -> "action"
    - "love", "kiss", "romance" -> "romance"
    - "mystery", "secret", "hide" -> "mystery"
    - "dialogue", "talk", "say" -> "dialogue"
    - "exposition", "explain", "reveal" -> "exposition"
    """
    text_lower = text.lower()
    
    theme_keywords = {
        "action": ["action", "fight", "chase", "battle", "attack", "run", "escape"],
        "romance": ["love", "kiss", "romance", "heart", "embrace", "affection"],
        "mystery": ["mystery", "secret", "hide", "discover", "clue", "unknown"],
        "dialogue": ["dialogue", "talk", "say", "speak", "ask", "answer", "reply"],
        "exposition": ["exposition", "explain", "reveal", "show", "tell", "describe"],
        "suspense": ["suspense", "danger", "threat", "fear", "worry", "anxious"],
        "comedy": ["comedy", "laugh", "funny", "joke", "humor", "amusing"],
        "drama": ["drama", "emotional", "sad", "cry", "conflict", "tension"]
    }
    
    detected_themes = []
    for theme, keywords in theme_keywords.items():
        if any(kw in text_lower for kw in keywords):
            detected_themes.append(theme)
    
    return detected_themes if detected_themes else ["other"]

def calculate_entropy(themes: List[str]) -> float:
    """Calculate Shannon entropy: H = -Σ(p_i * log(p_i))"""
    if not themes:
        return 0.0
    
    counts = Counter(themes)
    total = len(themes)
    entropy = 0.0
    
    for count in counts.values():
        p = count / total
        if p > 0:
            entropy -= p * math.log2(p)
    
    return entropy

def main():
    """Run diversity checks on all scenes."""
    # Find metadata
    metadata_path = "logs"
    if len(sys.argv) > 1:
        metadata_path = sys.argv[1]
    elif not Path("logs").exists():
        print("[ERROR] No logs directory found")
        sys.exit(2)
    
    # Use most recent run if directory specified
    if Path(metadata_path).is_dir():
        # Check if metadata file exists directly in this directory
        candidate = Path(metadata_path) / "artifact-metadata.json"
        if candidate.exists():
            metadata_path = candidate
        else:
            # Otherwise find most recent subdirectory
            logs = sorted(Path(metadata_path).glob("*"), key=lambda p: p.stat().st_mtime, reverse=True)
            if logs:
                metadata_path = logs[0] / "artifact-metadata.json"
    else:
        # If given a file path, use as-is
        metadata_path = Path(metadata_path) if not isinstance(metadata_path, Path) else metadata_path
        if not str(metadata_path).endswith('artifact-metadata.json'):
            metadata_path = Path(str(metadata_path) + "/artifact-metadata.json")
    
    if not metadata_path.exists():
        print(f"[ERROR] artifact-metadata.json not found at {metadata_path}")
        sys.exit(2)
    
    metadata = load_metadata(str(metadata_path))
    if not metadata:
        sys.exit(2)
    
    print("[INFO] Analyzing thematic diversity...")
    
    results = {
        "check_name": "diversity",
        "timestamp": str(Path(metadata_path).parent.name),
        "scenes": [],
        "theme_distribution": {}
    }
    
    all_themes = []
    for i, scene in enumerate(metadata.get("Scenes", [])):
        scene_id = scene.get("SceneId", f"scene_{i}")
        prompt = scene.get("Prompt", "")
        
        if not prompt:
            print(f"[WARN] Scene {scene_id}: No prompt found")
            continue
        
        themes = extract_themes(prompt)
        all_themes.extend(themes)
        
        results["scenes"].append({
            "scene_id": scene_id,
            "themes": themes
        })
        
        print(f"[OK] Scene {scene_id}: themes={', '.join(themes)}")
    
    # Calculate entropy
    entropy = calculate_entropy(all_themes)
    
    # Theme distribution
    theme_counts = Counter(all_themes)
    for theme, count in theme_counts.most_common():
        results["theme_distribution"][theme] = count
    
    results["entropy"] = round(entropy, 3)
    results["meets_threshold"] = entropy >= 2.0
    
    print(f"\n[RESULT] Thematic entropy: {results['entropy']} (threshold: 2.0)")
    print(f"[RESULT] Theme distribution: {dict(theme_counts)}")
    print(f"[STATUS] {'PASS' if results['meets_threshold'] else 'WARN'}")
    
    # Save results
    report_path = Path(metadata_path).parent / "diversity-check-report.json"
    with open(report_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"[INFO] Report saved: {report_path}")
    
    sys.exit(0 if results['meets_threshold'] else 1)

if __name__ == "__main__":
    main()
