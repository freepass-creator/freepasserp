"""
변환 결과의 maker/model/sub가 CAR_MODELS 마스터에 정확히 매칭되는지 검증
"""
import csv
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

# CAR_MODELS 파싱 (js 파일에서 직접 읽어옴)
CM_PATH = 'd:/dev/freepasserp/static/js/data/car-models.js'
with open(CM_PATH, encoding='utf-8') as f:
    js = f.read()

entries = re.findall(
    r"\{\s*maker:\s*'([^']+)',\s*model:\s*'([^']+)',\s*sub:\s*'([^']+)'",
    js
)

# (maker, model, sub) 셋
cm_set = set(entries)
cm_makers = set(e[0] for e in entries)
cm_models = {}  # maker -> set of models
cm_subs = {}  # (maker, model) -> set of subs
for mk, md, sb in entries:
    cm_models.setdefault(mk, set()).add(md)
    cm_subs.setdefault((mk, md), set()).add(sb)

print(f'CAR_MODELS: {len(entries)}건')
print(f'  제조사: {len(cm_makers)}종')
print()

# 변환 결과 검증
SRC = 'd:/dev/freepasserp/all_partners_normalized.csv'
with open(SRC, encoding='utf-8-sig') as f:
    rows = list(csv.DictReader(f))

print(f'검증 대상: {len(rows)}건')
print()

stats = {
    'ok': 0,
    'maker_unknown': [],
    'model_unknown': [],
    'sub_unknown': [],
}

for r in rows:
    mk = r['maker']
    md = r['model_name']
    sb = r['sub_model']
    if not mk or not md or not sb:
        continue
    if mk not in cm_makers:
        stats['maker_unknown'].append((mk, md, sb))
        continue
    if md not in cm_models.get(mk, set()):
        stats['model_unknown'].append((mk, md, sb))
        continue
    if sb not in cm_subs.get((mk, md), set()):
        stats['sub_unknown'].append((mk, md, sb))
        continue
    stats['ok'] += 1

print(f'OK: {stats["ok"]}건')
print(f'maker 미매칭: {len(stats["maker_unknown"])}건')
print(f'model 미매칭: {len(stats["model_unknown"])}건')
print(f'sub 미매칭: {len(stats["sub_unknown"])}건')
print()

# 미매칭 unique
from collections import Counter

def show(title, items, n=999):
    if not items:
        return
    print(f'=== {title} ===')
    cnt = Counter(items)
    for (mk, md, sb), c in sorted(cnt.items(), key=lambda x: -x[1])[:n]:
        print(f'  [{c}] {mk} | {md} | {sb}')
    print()

show('제조사 미매칭', stats['maker_unknown'])
show('모델 미매칭', stats['model_unknown'])
show('세부모델 미매칭', stats['sub_unknown'], n=200)
