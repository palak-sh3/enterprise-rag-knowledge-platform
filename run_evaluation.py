import csv
from generate_answer import generate_answer_with_sources
from config import EVALUATION_DIR
source=EVALUATION_DIR/"evaluation_dataset.csv"
if not source.exists(): raise SystemExit("Run python create_evaluation_dataset.py first.")
rows=list(csv.DictReader(source.open(encoding="utf-8")))
output=EVALUATION_DIR/"rag_results.csv"
results=[]
for row in rows:
 try:
  answer,sources=generate_answer_with_sources(row["question"],"admin")
  results.append({**row,"answer":answer,"contexts":" || ".join(s["text"] for s in sources),"error":""})
  print(f"Completed {row['id']}/{len(rows)}")
 except Exception as exc:
  results.append({**row,"answer":"","contexts":"","error":str(exc)})
with output.open("w",newline="",encoding="utf-8") as f:
 writer=csv.DictWriter(f,fieldnames=list(results[0].keys()) if results else ["id"]); writer.writeheader(); writer.writerows(results)
print(f"Saved results: {output}")
