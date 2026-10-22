from datetime import date, datetime, timedelta
from typing import Any
import uuid

from app.models.user import StudentProfile
from app.schemas.planner import StudyPlanProposal, StudyTaskProposal

# Core scheduling constants
PLANNING_DAYS = 14
SCENARIO_START_DATE = date(2026, 10, 10)
SCENARIO_END_DATE = date(2026, 10, 23)
WINDOW_START_TIME = "19:00"
WINDOW_END_TIME = "22:00"
WINDOW_START_MINUTES = 19 * 60  # 1140 minutes from midnight
WINDOW_END_MINUTES = 22 * 60    # 1320 minutes from midnight
TOTAL_DAILY_MINUTES = 180       # 3 hours (7:00 PM to 10:00 PM)
DAILY_BREAK_MINUTES = 20        # 20 minutes break allowance
MAX_DAILY_STUDY_MINUTES = 160   # 180 - 20 = 160 minutes max study workload per day
MAX_TOTAL_WORKLOAD_MINUTES = PLANNING_DAYS * MAX_DAILY_STUDY_MINUTES  # 2,240 minutes = 37h 20m
REQUIRED_TASKS_PER_DAY = 2
REQUIRED_TOTAL_TASKS = PLANNING_DAYS * REQUIRED_TASKS_PER_DAY  # 28 tasks


def minutes_to_time_str(minutes: int) -> str:
    h = minutes // 60
    m = minutes % 60
    return f"{h:02d}:{m:02d}"


def time_str_to_minutes(time_str: str) -> int:
    parts = time_str.strip().split(":")
    return int(parts[0]) * 60 + int(parts[1])


def get_planning_dates(start_date: date | None = None) -> list[date]:
    base_date = start_date or SCENARIO_START_DATE
    return [base_date + timedelta(days=i) for i in range(PLANNING_DAYS)]


def assign_daily_task_times(
    tasks: list[dict[str, Any]],
    start_time_min: int = WINDOW_START_MINUTES,
    break_total_min: int = DAILY_BREAK_MINUTES,
) -> list[dict[str, Any]]:
    """
    Schedules tasks sequentially starting at 19:00 with the break allowance
    distributed between tasks so the schedule fits within 19:00–22:00.
    """
    if not tasks:
        return tasks

    k = len(tasks)
    scheduled: list[dict[str, Any]] = []
    current_min = start_time_min

    if k == 1:
        task_copy = dict(tasks[0])
        task_copy["scheduled_time"] = minutes_to_time_str(current_min)
        scheduled.append(task_copy)
        return scheduled

    # Distribute break across task gaps
    gaps = k - 1
    break_per_gap = break_total_min // gaps
    extra_break = break_total_min % gaps

    for i, t in enumerate(tasks):
        task_copy = dict(t)
        task_copy["scheduled_time"] = minutes_to_time_str(current_min)
        scheduled.append(task_copy)
        
        current_min += int(task_copy["duration_minutes"])
        if i < gaps:
            gap_break = break_per_gap + (1 if i < extra_break else 0)
            current_min += gap_break

    return scheduled


def sanitize_daily_task_durations(
    tasks: list[dict[str, Any]],
    max_minutes: int = MAX_DAILY_STUDY_MINUTES,
) -> list[dict[str, Any]]:
    """
    Ensures that task durations on a day are positive integers and their sum
    does not exceed the maximum daily limit (160 minutes).
    """
    if not tasks:
        return []

    cleaned: list[dict[str, Any]] = []
    for t in tasks:
        dur = int(t.get("duration_minutes", 60) or 60)
        dur = max(15, dur)
        cleaned_task = dict(t)
        cleaned_task["duration_minutes"] = dur
        cleaned.append(cleaned_task)

    current_sum = sum(t["duration_minutes"] for t in cleaned)
    if current_sum <= max_minutes:
        return cleaned

    # Scale down proportionally to fit within max_minutes
    scale = max_minutes / current_sum
    allocated = 0
    for t in cleaned:
        scaled_dur = max(15, int(t["duration_minutes"] * scale))
        t["duration_minutes"] = scaled_dur
        allocated += scaled_dur

    # Adjust rounding differences on the largest task so sum <= max_minutes
    diff = max_minutes - allocated
    if diff != 0 and cleaned:
        largest = max(cleaned, key=lambda x: x["duration_minutes"])
        new_val = largest["duration_minutes"] + diff
        if new_val >= 15:
            largest["duration_minutes"] = new_val

    # Guarantee strict upper bound
    while sum(t["duration_minutes"] for t in cleaned) > max_minutes:
        largest = max(cleaned, key=lambda x: x["duration_minutes"])
        largest["duration_minutes"] -= 1

    return cleaned


def _build_default_day_tasks(
    day_index: int,
    target_subjects: list[str],
    weak_topics: list[str],
    strong_topics: list[str] | None = None,
) -> list[dict[str, Any]]:
    """
    Deterministic task generator for a day implementing required priorities:
    1. Mathematics, Physics, Chemistry weak topics (MCQs, numerical practice)
    2. Computer Science as secondary priority (or remaining subjects)
    3. Spaced revision and review
    Provides 2 tasks of 80 minutes each = 160 minutes daily study capacity.
    """
    subjects_lower = [s.strip().lower() for s in target_subjects]
    has_math = any("math" in s or "calc" in s for s in subjects_lower)
    has_phys = any("phys" in s for s in subjects_lower)
    has_chem = any("chem" in s for s in subjects_lower)
    has_cs = any("computer" in s or "cs" in s or "code" in s or "programm" in s for s in subjects_lower)

    # Standardized prioritized subjects
    math_subj = next((s for s in target_subjects if "math" in s.lower() or "calc" in s.lower()), "Mathematics")
    phys_subj = next((s for s in target_subjects if "phys" in s.lower()), "Physics")
    chem_subj = next((s for s in target_subjects if "chem" in s.lower()), "Chemistry")
    cs_subj = next((s for s in target_subjects if "computer" in s.lower() or "cs" in s.lower()), target_subjects[-1] if target_subjects else "Computer Science")

    # Cycle patterns across the 14 days
    cycle = day_index % 4

    if cycle == 0:
        # Math Weak Topic Numerical Practice + Physics Problem Solving
        return [
            {
                "topic_id": f"math_weak_{day_index}",
                "topic_name": weak_topics[0] if weak_topics else "Calculus & Algebra Problem Solving",
                "subject": math_subj,
                "duration_minutes": 80,
                "priority_tag": "Weak Area",
                "rationale": "High-yield numerical practice and MCQ drills on core weak topics.",
            },
            {
                "topic_id": f"phys_prob_{day_index}",
                "topic_name": weak_topics[1] if len(weak_topics) > 1 else "Mechanics & Electromagnetism Drills",
                "subject": phys_subj,
                "duration_minutes": 80,
                "priority_tag": "Weak Area",
                "rationale": "Targeted problem-solving session and formula application.",
            },
        ]
    elif cycle == 1:
        # Chemistry Weak Area MCQs + Computer Science Coding / Practice
        return [
            {
                "topic_id": f"chem_mcq_{day_index}",
                "topic_name": weak_topics[2] if len(weak_topics) > 2 else "Organic & Physical Chemistry MCQs",
                "subject": chem_subj,
                "duration_minutes": 80,
                "priority_tag": "Weak Area",
                "rationale": "Reaction mechanisms, numerical equations, and MCQ practice.",
            },
            {
                "topic_id": f"cs_practice_{day_index}",
                "topic_name": "Data Structures & Algorithm Practice",
                "subject": cs_subj,
                "duration_minutes": 80,
                "priority_tag": "Regular",
                "rationale": "Secondary priority practice: coding drills and syntax mastery.",
            },
        ]
    elif cycle == 2:
        # Math & Chemistry Numerical Practice
        return [
            {
                "topic_id": f"math_num_{day_index}",
                "topic_name": "Advanced Problem Solving & Previous Year Questions",
                "subject": math_subj,
                "duration_minutes": 80,
                "priority_tag": "Exam Prep",
                "rationale": "Timed problem solving under exam conditions.",
            },
            {
                "topic_id": f"phys_optics_{day_index}",
                "topic_name": "Electromagnetism & Wave Optics Review",
                "subject": phys_subj,
                "duration_minutes": 80,
                "priority_tag": "Spaced Revision",
                "rationale": "Concept consolidation, derivations, and numerical problem solving.",
            },
        ]
    else:
        # Spaced Revision & Secondary Subject Review
        return [
            {
                "topic_id": f"chem_rev_{day_index}",
                "topic_name": "Inorganic Principles & Physical Equilibrium Revision",
                "subject": chem_subj,
                "duration_minutes": 80,
                "priority_tag": "Spaced Revision",
                "rationale": "Spaced repetition of chemical equations and definitions.",
            },
            {
                "topic_id": f"cs_review_{day_index}",
                "topic_name": "Boolean Logic & Computer Systems Review",
                "subject": cs_subj,
                "duration_minutes": 80,
                "priority_tag": "Regular",
                "rationale": "Secondary subject topic review and question drills.",
            },
        ]


def build_deterministic_study_plan_proposal(
    profile: StudentProfile,
    generation_tasks: list[dict[str, Any]] | None,
    start_date: date | None = None,
    summary: str | None = None,
) -> StudyPlanProposal:
    """
    Constructs a compliant, deterministic 14-day study plan proposal
    matching all scheduling constraints:
    - Start date: 2026-10-10 (or start_date)
    - End date: 2026-10-23 inclusive (exactly 14 calendar dates)
    - Exactly 28 tasks (exactly 2 tasks of 80 minutes each per day)
    - 19:00–22:00 daily window (19:00–20:20 Task 1, 20:20–20:40 Break, 20:40–22:00 Task 2)
    - Max 160 minutes daily study tasks
    - 20 minutes daily break allowance
    - Exactly 2,240 minutes total workload (37.33 hours)
    - Strictly zero tasks on or after 2026-10-24
    """
    planning_dates = get_planning_dates(start_date)
    start_d = planning_dates[0]
    end_d = planning_dates[-1]

    target_subjects = list(profile.target_subjects) if profile.target_subjects else ["General"]
    weak_topics = list(profile.weak_topics) if profile.weak_topics else []

    # Map raw tasks from generation to valid calendar dates within the 14-day window
    tasks_by_date: dict[date, list[dict[str, Any]]] = {d: [] for d in planning_dates}
    
    if generation_tasks:
        for i, t in enumerate(generation_tasks):
            if not isinstance(t, dict):
                continue
            raw_date = t.get("scheduled_date")
            target_date: date | None = None
            if isinstance(raw_date, str):
                try:
                    target_date = date.fromisoformat(raw_date[:10])
                except ValueError:
                    target_date = None
            elif isinstance(raw_date, date):
                target_date = raw_date

            # Only accept tasks that fall strictly inside planning_dates (ignore 24 Oct and invalid dates)
            if target_date is not None and target_date in tasks_by_date:
                subject = str(t.get("subject") or target_subjects[0])
                topic_name = str(t.get("topic_name") or t.get("subject") or "Study Session")
                topic_id = str(t.get("topic_id") or topic_name.lower().replace(" ", "_") or "general")
                priority_tag = str(t.get("priority_tag") or "Regular")
                rationale = t.get("rationale")

                normalized_task = {
                    "topic_id": topic_id,
                    "topic_name": topic_name,
                    "subject": subject,
                    "scheduled_date": target_date,
                    "duration_minutes": 80,
                    "priority_tag": priority_tag,
                    "rationale": rationale,
                }
                tasks_by_date[target_date].append(normalized_task)

    final_task_proposals: list[StudyTaskProposal] = []
    total_minutes = 0

    # Ensure EXACTLY 2 tasks of 80 minutes each for each of the 14 days
    for day_idx, d in enumerate(planning_dates):
        day_pool = tasks_by_date[d]
        default_pair = _build_default_day_tasks(day_idx, target_subjects, weak_topics)

        selected_tasks: list[dict[str, Any]] = []
        if len(day_pool) >= 2:
            selected_tasks = day_pool[:2]
        elif len(day_pool) == 1:
            selected_tasks = [day_pool[0], default_pair[1]]
        else:
            selected_tasks = default_pair

        # Schedule exactly 2 tasks per day:
        # Task 1: 19:00 - 20:20 (80 mins)
        # Break:  20:20 - 20:40 (20 mins break allowance)
        # Task 2: 20:40 - 22:00 (80 mins)
        t1 = dict(selected_tasks[0])
        t1["scheduled_date"] = d
        t1["scheduled_time"] = "19:00"
        t1["duration_minutes"] = 80

        t2 = dict(selected_tasks[1])
        t2["scheduled_date"] = d
        t2["scheduled_time"] = "20:40"
        t2["duration_minutes"] = 80

        for st in [t1, t2]:
            task_obj = StudyTaskProposal(
                topic_id=str(st.get("topic_id") or uuid.uuid4().hex[:8]),
                topic_name=str(st.get("topic_name") or "Study Session"),
                subject=str(st.get("subject") or target_subjects[0]),
                scheduled_date=d,
                scheduled_time=str(st["scheduled_time"]),
                duration_minutes=int(st["duration_minutes"]),
                priority_tag=str(st.get("priority_tag") or "Regular"),
                rationale=st.get("rationale"),
            )
            final_task_proposals.append(task_obj)
            total_minutes += task_obj.duration_minutes

    total_hours = round(total_minutes / 60, 2)
    canonical_summary = (
        f"14-Day Strategic Study Plan ({start_d.strftime('%d %b')} – {end_d.strftime('%d %b %Y')}): "
        f"{total_hours} total study hours ({total_minutes} mins) across 14 calendar days "
        f"({start_d.isoformat()} to {end_d.isoformat()} inclusive). Exactly 28 scheduled tasks "
        f"(2 tasks of 80m daily) capped at 160 study mins daily (7:00 PM – 10:00 PM window with 20m daily break)."
    )

    return StudyPlanProposal(
        planning_period_start=start_d,
        planning_period_end=end_d,
        subjects=target_subjects,
        tasks=final_task_proposals,
        total_planned_hours=total_hours,
        summary=canonical_summary,
        daily_study_minutes=MAX_DAILY_STUDY_MINUTES,
        daily_break_minutes=DAILY_BREAK_MINUTES,
        total_planned_minutes=total_minutes,
    )


def validate_study_plan_proposal(proposal: StudyPlanProposal) -> list[str]:
    """
    Deterministic validator enforcing all scheduling rules:
    1. Exactly 14 consecutive calendar dates
    2. Start and end dates both covered (for 2026-10-10, end must be 2026-10-23)
    3. Strictly NO task on or after 2026-10-24
    4. Exactly 14 distinct dates with tasks
    5. Exactly 28 tasks total (2 tasks per day)
    6. Daily study duration <= 160 minutes
    7. Total study workload <= 2,240 minutes
    8. Daily break allowance (20m) accounted for within 19:00–22:00 window
    9. Tasks fit strictly within 19:00–22:00 evening window
    10. Total planned hours matches sum of actual task durations
    11. Summary matches validated date bounds and numbers
    """
    errors: list[str] = []

    # 1. Exactly 14 calendar days span
    span = (proposal.planning_period_end - proposal.planning_period_start).days + 1
    if span != PLANNING_DAYS:
        errors.append(
            f"Planning period must be exactly {PLANNING_DAYS} calendar days (found {span} days from {proposal.planning_period_start} to {proposal.planning_period_end})."
        )

    expected_dates = [
        proposal.planning_period_start + timedelta(days=i) for i in range(span)
    ]
    expected_date_set = set(expected_dates)

    # 2. Strict scenario bound check
    if proposal.planning_period_start == SCENARIO_START_DATE:
        if proposal.planning_period_end != SCENARIO_END_DATE:
            errors.append(
                f"For scenario starting on {SCENARIO_START_DATE}, end date must be {SCENARIO_END_DATE} inclusive (found {proposal.planning_period_end})."
            )

    if not proposal.tasks:
        errors.append("Study plan proposal must contain tasks.")
        return errors

    distinct_dates = {t.scheduled_date for t in proposal.tasks}

    # 3. Exactly 14 distinct calendar dates must have tasks
    if len(distinct_dates) != PLANNING_DAYS:
        errors.append(
            f"Proposal must have exactly {PLANNING_DAYS} distinct calendar dates with tasks, found {len(distinct_dates)}."
        )

    # 4. Strictly no task on or after 24 October for scenario or outside planning period
    for task in proposal.tasks:
        if proposal.planning_period_start == SCENARIO_START_DATE and task.scheduled_date == date(2026, 10, 24):
            errors.append(
                f"Task '{task.topic_name}' is scheduled on 2026-10-24. No tasks are permitted on 24 October."
            )
        elif task.scheduled_date > proposal.planning_period_end:
            errors.append(
                f"Task '{task.topic_name}' has scheduled date {task.scheduled_date} after planning period end ({proposal.planning_period_end})."
            )
        elif task.scheduled_date not in expected_date_set:
            errors.append(
                f"Task '{task.topic_name}' has scheduled date {task.scheduled_date} outside the planning period ({proposal.planning_period_start} to {proposal.planning_period_end})."
            )

    # 5. Exactly 28 tasks required (2 per day)
    if len(proposal.tasks) != REQUIRED_TOTAL_TASKS:
        errors.append(
            f"Proposal must contain exactly {REQUIRED_TOTAL_TASKS} tasks (2 per day), found {len(proposal.tasks)}."
        )

    # 6. Group tasks by date and validate daily constraints
    tasks_by_date: dict[date, list[StudyTaskProposal]] = {d: [] for d in expected_dates}
    for task in proposal.tasks:
        if task.scheduled_date in tasks_by_date:
            tasks_by_date[task.scheduled_date].append(task)

    missing_dates = [d for d in expected_dates if len(tasks_by_date[d]) == 0]
    if missing_dates:
        errors.append(
            f"Planning period is missing study tasks for {len(missing_dates)} calendar date(s): {', '.join(d.isoformat() for d in missing_dates)}."
        )

    total_task_minutes = 0
    for d, day_tasks in tasks_by_date.items():
        if not day_tasks:
            continue
        if len(day_tasks) != REQUIRED_TASKS_PER_DAY:
            errors.append(
                f"Day {d.isoformat()} must have exactly {REQUIRED_TASKS_PER_DAY} tasks, found {len(day_tasks)}."
            )

        day_minutes = sum(t.duration_minutes for t in day_tasks)
        total_task_minutes += day_minutes

        if day_minutes > MAX_DAILY_STUDY_MINUTES:
            errors.append(
                f"Day {d.isoformat()} total study workload ({day_minutes} min) exceeds maximum daily limit of {MAX_DAILY_STUDY_MINUTES} minutes."
            )
        if day_minutes <= 0:
            errors.append(f"Day {d.isoformat()} must have positive study duration.")

        # Check individual task bounds and evening window
        for t in day_tasks:
            if t.duration_minutes <= 0:
                errors.append(f"Task '{t.topic_name}' on {d.isoformat()} has non-positive duration: {t.duration_minutes} min.")

            try:
                start_m = time_str_to_minutes(t.scheduled_time)
                end_m = start_m + t.duration_minutes
                if start_m < WINDOW_START_MINUTES:
                    errors.append(
                        f"Task '{t.topic_name}' scheduled at {t.scheduled_time} starts before the evening window ({WINDOW_START_TIME})."
                    )
                if end_m > WINDOW_END_MINUTES:
                    errors.append(
                        f"Task '{t.topic_name}' scheduled at {t.scheduled_time} with duration {t.duration_minutes}m finishes after the evening window ({WINDOW_END_TIME})."
                    )
            except Exception:
                errors.append(f"Task '{t.topic_name}' on {d.isoformat()} has invalid scheduled_time '{t.scheduled_time}'.")

            if not t.subject or not t.subject.strip():
                errors.append(f"Task on {d.isoformat()} is missing a valid subject.")
            if not t.topic_name or not t.topic_name.strip():
                errors.append(f"Task on {d.isoformat()} is missing a valid topic name.")

        # Daily window & break allowance check
        if day_minutes + DAILY_BREAK_MINUTES > TOTAL_DAILY_MINUTES:
            errors.append(
                f"Day {d.isoformat()} combined study time ({day_minutes}m) and break allowance ({DAILY_BREAK_MINUTES}m) exceed daily window ({TOTAL_DAILY_MINUTES}m)."
            )

    # 7. Total workload limit
    if total_task_minutes > MAX_TOTAL_WORKLOAD_MINUTES:
        errors.append(
            f"Total study workload ({total_task_minutes} min) exceeds maximum limit of {MAX_TOTAL_WORKLOAD_MINUTES} minutes (37h 20m)."
        )
    if total_task_minutes <= 0:
        errors.append("Total study duration must be greater than 0 minutes.")

    # 8. Total workload field consistency
    expected_hours = round(total_task_minutes / 60, 2)
    if abs(proposal.total_planned_hours - (total_task_minutes / 60)) > 0.05:
        errors.append(
            f"Total planned hours ({proposal.total_planned_hours}) does not match the sum of actual task durations ({total_task_minutes} min = {expected_hours} hrs)."
        )

    # 9. Summary consistency check
    if proposal.summary:
        if proposal.planning_period_start == SCENARIO_START_DATE and (
            "24 October" in proposal.summary or "2026-10-24" in proposal.summary
        ):
            errors.append("Proposal summary contains invalid end date 24 October.")
        if "15 days" in proposal.summary or "15 calendar" in proposal.summary or "15 dates" in proposal.summary:
            errors.append("Proposal summary claims 15 days instead of 14 days.")
        if "30 tasks" in proposal.summary:
            errors.append("Proposal summary claims 30 tasks instead of 28 tasks.")

    return errors
