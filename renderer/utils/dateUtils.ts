import { format, formatDistanceToNowStrict, isToday, isYesterday } from 'date-fns';

export function formatGroupLabel(dateStr: string): string {
  if (dateStr === 'Today') return 'Today';
  const date = new Date(dateStr);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEE, MMM d');
}

export function formatMeetingTime(dateStr: string): string {
  if (dateStr === 'Today') return 'Just now';
  return format(new Date(dateStr), 'h:mm a').toLowerCase();
}

export function formatTimestamp(ms: number): string {
  return format(new Date(ms), 'hh:mm:ss a').toLowerCase();
}

export function formatTimeAgo(ts: number): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 10) return 'just now';
  return formatDistanceToNowStrict(ts, { addSuffix: true });
}
