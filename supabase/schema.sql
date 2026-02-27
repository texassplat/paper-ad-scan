-- Paper Ad Scan - Supabase Database Schema

CREATE TABLE papers (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE editions (
  id SERIAL PRIMARY KEY,
  paper_id INTEGER REFERENCES papers(id),
  date DATE NOT NULL,
  page_count INTEGER DEFAULT 0,
  ad_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(paper_id, date)
);

CREATE TABLE pages (
  id SERIAL PRIMARY KEY,
  edition_id INTEGER REFERENCES editions(id),
  page_num INTEGER NOT NULL,
  section TEXT,
  image_path TEXT,  -- path in Supabase Storage bucket
  UNIQUE(edition_id, page_num)
);

CREATE TABLE advertisers (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  paper_count INTEGER DEFAULT 0,
  total_ad_count INTEGER DEFAULT 0
);

CREATE TABLE ads (
  id SERIAL PRIMARY KEY,
  page_id INTEGER REFERENCES pages(id),
  advertiser TEXT NOT NULL,
  advertiser_id INTEGER REFERENCES advertisers(id),
  description TEXT,
  location TEXT,
  size TEXT,
  confidence TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE advertiser_papers (
  id SERIAL PRIMARY KEY,
  advertiser_id INTEGER REFERENCES advertisers(id),
  paper_id INTEGER REFERENCES papers(id),
  ad_count INTEGER DEFAULT 0,
  first_seen DATE,
  last_seen DATE,
  UNIQUE(advertiser_id, paper_id)
);

-- Indexes for common queries
CREATE INDEX idx_editions_paper_date ON editions(paper_id, date DESC);
CREATE INDEX idx_pages_edition ON pages(edition_id);
CREATE INDEX idx_ads_page ON ads(page_id);
CREATE INDEX idx_ads_advertiser ON ads(advertiser);
CREATE INDEX idx_ads_advertiser_id ON ads(advertiser_id);
CREATE INDEX idx_advertiser_papers_advertiser ON advertiser_papers(advertiser_id);
CREATE INDEX idx_advertiser_papers_paper ON advertiser_papers(paper_id);

-- Enable RLS (Row Level Security) with public read access
ALTER TABLE papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE advertisers ENABLE ROW LEVEL SECURITY;
ALTER TABLE advertiser_papers ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Public read papers" ON papers FOR SELECT USING (true);
CREATE POLICY "Public read editions" ON editions FOR SELECT USING (true);
CREATE POLICY "Public read pages" ON pages FOR SELECT USING (true);
CREATE POLICY "Public read ads" ON ads FOR SELECT USING (true);
CREATE POLICY "Public read advertisers" ON advertisers FOR SELECT USING (true);
CREATE POLICY "Public read advertiser_papers" ON advertiser_papers FOR SELECT USING (true);

-- Service role write policies (backend uses service role key)
CREATE POLICY "Service write papers" ON papers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write editions" ON editions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write pages" ON pages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write ads" ON ads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write advertisers" ON advertisers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write advertiser_papers" ON advertiser_papers FOR ALL USING (true) WITH CHECK (true);
