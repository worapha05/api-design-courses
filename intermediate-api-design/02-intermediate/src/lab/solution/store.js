export const devices = [
  { id: 'd1', name: 'Pump-A' },
  { id: 'd2', name: 'Pump-B' },
  { id: 'd3', name: 'Valve-1' },
  { id: 'd4', name: 'Valve-2' },
  { id: 'd5', name: 'Tank-North' },
];

/** deviceId → latest metric */
export const latest = new Map();

export function setMetric(metric) {
  latest.set(metric.deviceId, metric);
  return metric;
}

export function getMetricsByDeviceIds(deviceIds, counter) {
  counter.dbCalls += 1;
  console.log(`[store] getMetricsByDeviceIds(${deviceIds.join(',')}) #${counter.dbCalls}`);
  return deviceIds.map((id) => latest.get(id) ?? null);
}
