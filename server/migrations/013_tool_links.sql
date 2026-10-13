-- Ręczne przypisanie frezów do oprawek (zespół przypisuje sam — bez automatycznego dopasowania po średnicy chwytu)
CREATE TABLE tool_links (
  mill_id INTEGER NOT NULL REFERENCES tools(id),
  holder_id INTEGER NOT NULL REFERENCES tools(id),
  PRIMARY KEY (mill_id, holder_id)
);
CREATE INDEX ix_tool_links_holder ON tool_links(holder_id);
