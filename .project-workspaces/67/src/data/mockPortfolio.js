export const portfolioSummary = {
  totalValue: 847350,
  currency: 'USD',
  change24h: +12840,
  changePercent24h: +1.54,
  lastUpdated: '2 min ago'
}

// 24-hour sparkline data points (normalized values for SVG)
export const sparklineData = [
  834510, 831200, 829800, 833400, 836100, 834900, 838200,
  840100, 837800, 841500, 839200, 843700, 841100, 845000,
  843200, 846800, 844500, 847350
]

export const categories = [
  {
    id: 'watches',
    label: 'Rare Watches',
    icon: '⌚',
    value: 392000,
    count: 7,
    percent: 46.3,
    color: '#d4a017',
    glowColor: 'rgba(212, 160, 23, 0.25)'
  },
  {
    id: 'art',
    label: 'Fine Art',
    icon: '🖼',
    value: 271500,
    count: 4,
    percent: 32.0,
    color: '#8ba7c7',
    glowColor: 'rgba(139, 167, 199, 0.25)'
  },
  {
    id: 'fashion',
    label: 'Vintage Fashion',
    icon: '👜',
    value: 183850,
    count: 11,
    percent: 21.7,
    color: '#c7a8b8',
    glowColor: 'rgba(199, 168, 184, 0.25)'
  }
]

export const recentAssets = [
  {
    id: 1,
    category: 'watches',
    name: 'Patek Philippe Nautilus 5711',
    detail: 'Ref. 5711/1A-014 · 2019',
    value: 142000,
    acquired: 'Mar 2024',
    trend: 'up'
  },
  {
    id: 2,
    category: 'art',
    name: 'Jean-Michel Basquiat',
    detail: '"Untitled Study" · 1982, Acrylic',
    value: 185000,
    acquired: 'Jan 2024',
    trend: 'up'
  },
  {
    id: 3,
    category: 'fashion',
    name: '1986 Chanel Classic Flap',
    detail: 'Black Lambskin · Gold Hardware',
    value: 18500,
    acquired: 'Nov 2023',
    trend: 'up'
  },
  {
    id: 4,
    category: 'watches',
    name: 'Rolex Daytona "Paul Newman"',
    detail: 'Ref. 6239 · Tropical Dial · 1968',
    value: 215000,
    acquired: 'Sep 2023',
    trend: 'stable'
  },
  {
    id: 5,
    category: 'fashion',
    name: 'Hermès Birkin 25',
    detail: 'Noir Togo · Palladium · 2018',
    value: 28400,
    acquired: 'Aug 2023',
    trend: 'up'
  }
]

export const categoryColors = {
  watches: '#d4a017',
  art: '#8ba7c7',
  fashion: '#c7a8b8'
}