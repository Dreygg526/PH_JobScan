-- Natural-language brief: instead of keyword chips, the user describes in
-- plain language (English/Taglish) what they're looking for. Claude folds this
-- into both query-building and scoring. The old `keywords` column stays for
-- backward compatibility but is no longer populated by the UI.

alter table public.scans
  add column if not exists intent text;
