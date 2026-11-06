export function screenPath(districtId?: string | null) {
  return districtId ? `/screen?districtId=${encodeURIComponent(districtId)}` : "/screen";
}
