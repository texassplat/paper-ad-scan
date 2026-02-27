export interface Paper {
  id: number;
  slug: string;
  name: string;
}

export interface Edition {
  id: number;
  paper_id: number;
  date: string;
  page_count: number;
  ad_count: number;
  created_at: string;
}

export interface Page {
  id: number;
  edition_id: number;
  page_num: number;
  section: string;
  image_path: string;
}

export interface Ad {
  id: number;
  page_id: number;
  advertiser: string;
  description: string;
  location: string;
  size: string;
  confidence: string;
  created_at: string;
}

export interface PageWithAds extends Page {
  ads: Ad[];
}
