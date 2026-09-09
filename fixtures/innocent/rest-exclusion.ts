interface Record { secret: string; email: string; id: number }

export function publicData(value: Record) {
  const { secret: _secret, ...safe } = value;
  return safe;
}
