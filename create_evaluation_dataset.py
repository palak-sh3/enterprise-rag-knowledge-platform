import csv
from config import EVALUATION_DIR

# Replace/edit these sample rows so every reference answer is verified against your own indexed documents.
ROWS=[
 {"id":1,"question":"What is the main topic of the uploaded documents?","ground_truth":"The answer must be verified against the uploaded documents.","category":"answerable"},
 {"id":2,"question":"What exact policy is stated in the documents about remote work?","ground_truth":"I don't know based on the available documents.","category":"unanswerable"},
]
path=EVALUATION_DIR/"evaluation_dataset.csv"
with path.open("w",newline="",encoding="utf-8") as f:
 writer=csv.DictWriter(f,fieldnames=["id","question","ground_truth","category"]); writer.writeheader(); writer.writerows(ROWS)
print(f"Created {len(ROWS)} editable evaluation examples at {path}")
