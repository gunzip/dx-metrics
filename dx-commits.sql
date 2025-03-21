CREATE MATERIALIZED VIEW cached_select AS
SELECT id, name, count(*) 
FROM your_table
GROUP BY id, name;