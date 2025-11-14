#!/usr/bin/env python3
"""
Coherence Check: Narrative flow analysis using spaCy.

Measures how well entities (characters) are tracked and pronouns are resolved
across sentences in generated story scenes.

Exit codes:
- 0: Coherence score meets threshold (>=0.85)
- 1: Coherence score below threshold
- 2: Setup failed (missing dependencies)
"""

import json
import sys
from pathlib import Path
from typing import Optional

def check_dependencies():
    """Verify required packages."""
    try:
        import spacy
        return True
    except ImportError:
        print("[ERROR] spacy not installed. Run: pip install spacy")
        print("[ERROR] Download model: python -m spacy download en_core_web_sm")
        return False

def load_metadata(metadata_path: str) -> Optional[dict]:
    """Load artifact-metadata.json."""
    try:
        with open(metadata_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"[ERROR] Failed to load metadata: {e}")
        return None

def analyze_coherence(text: str) -> dict:
    """
    Analyze narrative coherence.
    
    Returns dict with:
    - entity_count: unique entities found
    - entity_links: successful entity links (pronouns resolved to entities)
    - pronoun_count: pronouns in text
    - link_ratio: entity_links / pronoun_count (0-1)
    - score: overall coherence (0-1)
    """
    import spacy
    
    try:
        nlp = spacy.load("en_core_web_sm")
    except OSError:
        print("[WARN] en_core_web_sm model not found. Attempting download...")
        import subprocess
        subprocess.run([sys.executable, "-m", "spacy", "download", "en_core_web_sm"], check=False)
        nlp = spacy.load("en_core_web_sm")
    
    doc = nlp(text)
    
    # Extract entities
    entities = set()
    for ent in doc.ents:
        if ent.label_ in ("PERSON", "ORG", "PRODUCT"):
            entities.add(ent.text.lower())
    
    # Count pronouns and track resolution
    pronouns = {"he", "she", "it", "they", "him", "her", "them", "his", "her", "their"}
    pronoun_count = 0
    resolved_count = 0
    
    for token in doc:
        if token.text.lower() in pronouns:
            pronoun_count += 1
            # Simplified: if pronoun has dependency link to entity, count as resolved
            if token.head and token.head.ent_type_ in ("PERSON", "ORG", "PRODUCT"):
                resolved_count += 1
    
    link_ratio = resolved_count / pronoun_count if pronoun_count > 0 else 0
    score = min(1.0, link_ratio)  # 0-1 scale
    
    return {
        "entity_count": len(entities),
        "entities": list(entities)[:10],  # Top 10 for brevity
        "pronoun_count": pronoun_count,
        "resolved_count": resolved_count,
        "link_ratio": round(link_ratio, 3),
        "score": round(score, 3)
    }

def main():
    """Run coherence checks on all scenes."""
    if not check_dependencies():
        sys.exit(2)
    
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
    
    print("[INFO] Analyzing narrative coherence...")
    
    results = {
        "check_name": "coherence",
        "timestamp": str(Path(metadata_path).parent.name),
        "scenes": []
    }
    
    total_score = 0
    for i, scene in enumerate(metadata.get("Scenes", [])):
        scene_id = scene.get("SceneId", f"scene_{i}")
        prompt = scene.get("Prompt", "")
        
        if not prompt:
            print(f"[WARN] Scene {scene_id}: No prompt found")
            continue
        
        coherence = analyze_coherence(prompt)
        coherence["scene_id"] = scene_id
        results["scenes"].append(coherence)
        total_score += coherence["score"]
        
        print(f"[OK] Scene {scene_id}: coherence={coherence['score']}, entities={coherence['entity_count']}, pronoun_links={coherence['resolved_count']}/{coherence['pronoun_count']}")
    
    # Calculate average
    if results["scenes"]:
        avg_score = round(total_score / len(results["scenes"]), 3)
        results["average_score"] = avg_score
        results["meets_threshold"] = avg_score >= 0.85
        
        print(f"\n[RESULT] Average coherence score: {avg_score} (threshold: 0.85)")
        print(f"[STATUS] {'PASS' if results['meets_threshold'] else 'FAIL'}")
        
        # Save results
        report_path = Path(metadata_path).parent / "coherence-check-report.json"
        with open(report_path, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"[INFO] Report saved: {report_path}")
        
        sys.exit(0 if results['meets_threshold'] else 1)
    else:
        print("[ERROR] No scenes processed")
        sys.exit(2)

if __name__ == "__main__":
    main()
