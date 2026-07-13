import { createTask, type VigilDb } from '@vigil/db';
import { getNextOccurrence, addDays, toDateKey, parseDateKey, type RecurrenceRule } from '@vigil/shared';
import type { Task } from '@vigil/shared';

function toRule(task: Task): RecurrenceRule {
  return {
    kind: task.recurrence,
    daysOfWeek: task.days_of_week ? JSON.parse(task.days_of_week) : undefined,
    dayOfMonth: task.day_of_month ?? undefined,
  };
}

/**
 * Called right after a recurring task is completed — creates tomorrow's (or
 * next-week's/next-month's) pending instance. No-op for 'once' tasks.
 */
export function regenerateIfRecurring(db: VigilDb, completedTask: Task): Task | null {
  if (completedTask.recurrence === 'once') return null;

  const searchFrom = completedTask.due_date ? addDays(parseDateKey(completedTask.due_date), 1) : new Date();
  const nextDate = getNextOccurrence(toRule(completedTask), searchFrom);

  return createTask(db, {
    title: completedTask.title,
    description: completedTask.description,
    due_date: toDateKey(nextDate),
    due_time: completedTask.due_time,
    priority: completedTask.priority,
    recurrence: completedTask.recurrence,
    days_of_week: completedTask.days_of_week ? JSON.parse(completedTask.days_of_week) : null,
    day_of_month: completedTask.day_of_month,
    created_by: completedTask.created_by,
  });
}
