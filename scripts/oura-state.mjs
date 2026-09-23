// region state-inference
// These are approximate observations, not a live sleep detector.
export function inferOuraState(kind, data, now = Date.now()) {
  const candidates = [];
  const add = (state, at, source) => {
    const time = Date.parse(at);
    if (Number.isFinite(time) && time <= now + 60000 && now - time <= 90 * 60000)
      candidates.push({state, observedAt: new Date(time).toISOString(), source});
  };
  if (kind === 'heartrate') {
    for (const sample of data?.data || []) {
      if (sample.source === 'sleep') add('sleep', sample.timestamp, 'heartrate:sleep');
      if (['awake', 'workout', 'live'].includes(sample.source)) add('awake', sample.timestamp, `heartrate:${sample.source}`);
    }
  } else if (kind === 'sleep') {
    // A completed sleep record is evidence of waking, not of currently sleeping.
    add('awake', data?.bedtime_end, 'sleep:ended');
  } else if (kind === 'workout') {
    add('awake', data?.end_datetime, 'workout:ended');
  } else if (kind === 'daily_activity' && typeof data?.class_5_min === 'string') {
    const start = Date.parse(data.timestamp);
    for (let i = 0; Number.isFinite(start) && i < data.class_5_min.length; i++) {
      // 3/4/5 are low/medium/high activity. Rest/inactivity alone is ambiguous.
      if ('345'.includes(data.class_5_min[i])) add('awake', new Date(start + i * 300000).toISOString(), 'activity:movement');
    }
  }
  return candidates.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0] || null;
}
// endregion state-inference
