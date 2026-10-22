import httpx
import uuid
import json
from datetime import date

base_url = 'http://127.0.0.1:8000'
client = httpx.Client(base_url=base_url, timeout=120)

uid = uuid.uuid4().hex[:6]
test_email = f"live_verify_14days_{uid}@example.com"

print("=== 1. Signup fresh student ===")
s_res = client.post("/api/v1/auth/signup", json={
    "full_name": "Live 14Day Student",
    "email": test_email,
    "password": "Password123!",
    "confirm_password": "Password123!"
})
assert s_res.status_code == 201, f"Signup failed: {s_res.text}"
print(f"Signed up: {test_email}")

print("=== 2. Complete baseline onboarding ===")
o_res = client.post("/api/v1/onboarding", json={
    "education_level": "High School",
    "board_curriculum": "CBSE",
    "grade_class": "Class 12",
    "target_subjects": ["Mathematics", "Physics", "Chemistry", "Computer Science"]
})
assert o_res.status_code == 200, f"Onboarding failed: {o_res.text}"
print("Baseline onboarding complete.")

print("=== 3. Conversational profile setup via AI Chat ===")
chat_res = client.post("/api/v1/ai/chat", json={
    "message": "My weak topics are Calculus Limits in Math and Magnetism in Physics. My target score is 90% with 160 minutes daily study."
})
assert chat_res.status_code == 200, f"Chat failed: {chat_res.text}"
print("AI chat completed successfully.")

print("=== 4. Generate Fresh Study Plan Proposal via Real AI ===")
gen_res = client.post("/api/v1/planner/generate-proposal")
assert gen_res.status_code == 200, f"Generate proposal failed: {gen_res.status_code} {gen_res.text}"
prop = gen_res.json()["proposal"]

print("\n--- VERIFIED FRESH PROPOSAL JSON TOTALS ---")
print("Planning Period Start:", prop["planning_period_start"])
print("Planning Period End:  ", prop["planning_period_end"])
print("Total Planned Hours:  ", prop["total_planned_hours"])
print("Daily Study Minutes:  ", prop["daily_study_minutes"])
print("Daily Break Minutes:  ", prop["daily_break_minutes"])
print("Total Planned Minutes:", prop["total_planned_minutes"])
print("Summary:              ", prop["summary"])
print("Total Tasks:          ", len(prop["tasks"]))

tasks = prop["tasks"]
dates = sorted(list({t["scheduled_date"] for t in tasks}))
print(f"Distinct Dates ({len(dates)}):", dates)

# Strict assertions
assert prop["planning_period_start"] == "2026-10-10", f"Expected start 2026-10-10, got {prop['planning_period_start']}"
assert prop["planning_period_end"] == "2026-10-23", f"Expected end 2026-10-23, got {prop['planning_period_end']}"
assert len(dates) == 14, f"Expected exactly 14 calendar dates, got {len(dates)}"
assert dates[0] == "2026-10-10"
assert dates[-1] == "2026-10-23"
assert "2026-10-24" not in dates, "CRITICAL: Found 2026-10-24 in tasks!"
assert len(tasks) == 28, f"Expected exactly 28 tasks, got {len(tasks)}"

for d_str in dates:
    d_tasks = [t for t in tasks if t["scheduled_date"] == d_str]
    assert len(d_tasks) == 2, f"Date {d_str} has {len(d_tasks)} tasks, expected 2"
    assert sum(t["duration_minutes"] for t in d_tasks) == 160, f"Date {d_str} study minutes != 160"
    assert d_tasks[0]["scheduled_time"] == "19:00", f"Task 1 on {d_str} time != 19:00"
    assert d_tasks[1]["scheduled_time"] == "20:40", f"Task 2 on {d_str} time != 20:40"

total_mins = sum(t["duration_minutes"] for t in tasks)
assert total_mins == 2240, f"Expected 2240 mins, got {total_mins}"
assert prop["total_planned_hours"] == 37.33, f"Expected 37.33 hours, got {prop['total_planned_hours']}"
assert "24 October" not in prop["summary"], "Summary mentions 24 October!"
assert "10 Oct – 23 Oct 2026" in prop["summary"]

print("\n=== 5. Test Confirmation Rejection of Invalid Proposal (15 dates / 24 Oct) ===")
invalid_prop = dict(prop)
invalid_prop["planning_period_end"] = "2026-10-24"
invalid_prop["tasks"] = list(tasks) + [{
    "topic_id": "invalid_extra",
    "topic_name": "Extra Task on 24 October",
    "subject": "Mathematics",
    "scheduled_date": "2026-10-24",
    "scheduled_time": "19:00",
    "duration_minutes": 80,
    "priority_tag": "Weak Area",
}]
rej_res = client.post("/api/v1/planner/confirm-plan", json={"proposal": invalid_prop, "confirmed": True})
assert rej_res.status_code == 400, f"Expected 400 rejection, got {rej_res.status_code}"
print("Rejection verified: HTTP 400 with detail:", rej_res.json()["detail"])

print("\n=== 6. Test Confirmation of Valid Proposal (28 tasks / 14 dates) ===")
conf_res = client.post("/api/v1/planner/confirm-plan", json={"proposal": prop, "confirmed": True})
assert conf_res.status_code == 201, f"Confirm plan failed: {conf_res.status_code} {conf_res.text}"
conf_data = conf_res.json()
print("Confirm plan success: HTTP 201")
print("Next route:", conf_data["data"]["next_route"])
print("Persisted tasks count:", len(conf_data["data"]["tasks"]))
assert len(conf_data["data"]["tasks"]) == 28, f"Expected 28 persisted tasks, got {len(conf_data['data']['tasks'])}"

print("\n=== 7. Verify Dashboard Retrieval ===")
dash_res = client.get("/api/v1/dashboard/summary")
assert dash_res.status_code == 200
dash_data = dash_res.json()
print("Dashboard active_plan_version_id:", dash_data["active_plan_version_id"])
print("Today tasks count:", len(dash_data["today_tasks"]))
print("Upcoming tasks count:", len(dash_data["upcoming_tasks"]))

print("\n>>> ALL LIVE VERIFICATIONS COMPLETED SUCCESSFULLY! <<<")
