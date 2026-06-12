const FLAG_MAP: Record<string, string> = {
  'Mexico': '🇲🇽', 'South Africa': '🇿🇦', 'South Korea': '🇰🇷', 'Czech Republic': '🇨🇿',
  'Canada': '🇨🇦', 'Bosnia and Herzegovina': '🇧🇦', 'Qatar': '🇶🇦', 'Switzerland': '🇨🇭',
  'Brazil': '🇧🇷', 'Morocco': '🇲🇦', 'Haiti': '🇭🇹', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'United States': '🇺🇸', 'Paraguay': '🇵🇾', 'Australia': '🇦🇺', 'Turkey': '🇹🇷', 'Türkiye': '🇹🇷',
  'Ivory Coast': '🇨🇮', "Côte d'Ivoire": '🇨🇮', 'Ecuador': '🇪🇨', 'Germany': '🇩🇪', 'Curaçao': '🇨🇼',
  'Netherlands': '🇳🇱', 'Japan': '🇯🇵', 'Sweden': '🇸🇪', 'Tunisia': '🇹🇳',
  'Belgium': '🇧🇪', 'Egypt': '🇪🇬', 'Iran': '🇮🇷', 'New Zealand': '🇳🇿',
  'Spain': '🇪🇸', 'Saudi Arabia': '🇸🇦', 'Cape Verde': '🇨🇻', 'Cabo Verde': '🇨🇻',
  'Democratic Republic of the Congo': '🇨🇩', 'Congo DR': '🇨🇩',
  'Uruguay': '🇺🇾',
  'France': '🇫🇷', 'Iraq': '🇮🇶', 'Senegal': '🇸🇳', 'Norway': '🇳🇴',
  'Argentina': '🇦🇷', 'Austria': '🇦🇹', 'Algeria': '🇩🇿', 'Jordan': '🇯🇴',
  'Portugal': '🇵🇹', 'Uzbekistan': '🇺🇿', 'Colombia': '🇨🇴',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croatia': '🇭🇷', 'Ghana': '🇬🇭', 'Panama': '🇵🇦',
}

export function getFlag(country: string): string {
  return FLAG_MAP[country] ?? '🏳️'
}

export function getGroupLabel(group: string | null): string {
  if (!group) return ''
  return `Group ${group}`
}

export function getRoundColor(round: string): string {
  const colors: Record<string, string> = {
    'Group Stage': 'bg-blue-100 text-blue-700',
    'Round of 32': 'bg-purple-100 text-purple-700',
    'Round of 16': 'bg-indigo-100 text-indigo-700',
    'Quarterfinal': 'bg-orange-100 text-orange-700',
    'Semifinal': 'bg-red-100 text-red-700',
    'Third Place': 'bg-gray-100 text-gray-700',
    'Final': 'bg-yellow-100 text-yellow-700',
  }
  return colors[round] ?? 'bg-gray-100 text-gray-700'
}

export function getRoundIcon(round: string): string {
  const icons: Record<string, string> = {
    'Group Stage': '⚽',
    'Round of 32': '🏟️',
    'Round of 16': '🔥',
    'Quarterfinal': '⚡',
    'Semifinal': '🌟',
    'Third Place': '🥉',
    'Final': '🏆',
  }
  return icons[round] ?? '⚽'
}
