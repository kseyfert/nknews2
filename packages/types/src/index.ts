export interface Provider {
  id: number
  name: string
  website: string | null
  type: 'rss'
  source: string
  hidden: boolean
  disabled: boolean
  createdAt: Date
}

export interface Article {
  id: number
  providerId: number
  clusterId: number | null
  title: string
  url: string
  description: string | null
  providerCategories: string[]
  imageUrl: string | null
  publishedAt: Date
  fetchedAt: Date
  embedding: number[] | null
}