#!/usr/bin/env python3
"""
Similarity Check: Semantic alignment between input prompts and generated scenes.

Uses sentence-transformers (BERT) to compute cosine similarity.
Higher similarity = better prompt adherence.

Exit codes:
- 0: Alignment meets threshold (>=0.75)
- 1: Alignment below threshold
- 2: Setup failed
"""

import json
import sys
import numpy as np
from pathlib import Path
from typing import Optional, List, Tuple

def load_metadata(metadata_path: str) -> Optional[dict]:
    """Load artifact-metadata.json."""
    try:
        with open(metadata_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"[ERROR] Failed to load metadata: {e}")
        return None

def import_transformers():
    """Import and initialize sentence-transformers."""
    try:
        from sentence_transformers import SentenceTransformer
        print("[INFO] Loading BERT model (sentence-transformers/all-MiniLM-L6-v2)...")
        model = SentenceTransformer('all-MiniLM-L6-v2')
        return model
    except ImportError:
        print("[ERROR] sentence-transformers not installed")
        print("[INFO] Install with: pip install sentence-transformers")
        return None

def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return float(np.dot(vec1, vec2) / (norm1 * norm2))

def main():
    """Run similarity checks on all scenes."""
    # Load transformer model
    model = import_transformers()
    if not model:
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
    
    print("[INFO] Analyzing semantic alignment...")
    
    results = {
        "check_name": "similarity",
        "timestamp": str(Path(metadata_path).parent.name),
        "scenes": [],
        "aggregate_alignment": 0.0
    }
    
    similarities = []
    for i, scene in enumerate(metadata.get("Scenes", [])):
        scene_id = scene.get("SceneId", f"scene_{i}")
        prompt = scene.get("Prompt", "")
        description = scene.get("GeneratedDescription", "") or scene.get("Description", "")
        
        if not prompt or not description:
            print(f"[WARN] Scene {scene_id}: Missing prompt or description")
            continue
        
        # Encode texts
        try:
            prompt_embedding = model.encode(prompt, convert_to_numpy=True)
            description_embedding = model.encode(description, convert_to_numpy=True)
        except Exception as e:
            print(f"[ERROR] Scene {scene_id}: Failed to encode - {e}")
            continue
        
        # Compute similarity
        similarity = cosine_similarity(prompt_embedding, description_embedding)
        similarities.append(similarity)
        
        results["scenes"].append({
            "scene_id": scene_id,
            "similarity": round(similarity, 3),
            "prompt_preview": prompt[:80] if len(prompt) > 80 else prompt,
            "description_preview": description[:80] if len(description) > 80 else description
        })
        
        print(f"[OK] Scene {scene_id}: similarity={similarity:.3f}")
    
    # Aggregate alignment
    if similarities:
        aggregate = np.mean(similarities)
        results["aggregate_alignment"] = round(aggregate, 3)
        results["meets_threshold"] = aggregate >= 0.75
    else:
        print("[WARN] No scenes to analyze")
        results["meets_threshold"] = False
    
    print(f"\n[RESULT] Aggregate alignment: {results['aggregate_alignment']} (threshold: 0.75)")
    print(f"[STATUS] {'PASS' if results['meets_threshold'] else 'WARN'}")
    
    # Save results
    report_path = Path(metadata_path).parent / "similarity-check-report.json"
    with open(report_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"[INFO] Report saved: {report_path}")
    
    sys.exit(0 if results['meets_threshold'] else 1)

if __name__ == "__main__":
    main()
