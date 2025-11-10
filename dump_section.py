from pathlib import Path
text = Path('COMPREHENSIVE_ANALYSIS_AND_PLAN.md').read_text().splitlines()
for idx,line in enumerate(text):
    if line.startswith('## 4.'):
        for j in range(idx, min(idx+60, len(text))):
            print(j+1, text[j])
        break

