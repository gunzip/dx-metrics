CREATE OR REPLACE FUNCTION generate_member_search_queries(interval_days INT)
RETURNS TABLE (
  member_name TEXT,
  search_string TEXT
) AS $$
BEGIN
  RETURN QUERY EXECUTE '
    WITH members AS (
      SELECT 
        trim(both ''"'' from trim(unnest(string_to_array(
          regexp_replace(
            (SELECT content->>''dx_team_members'' FROM config.yml_file),
            ''[\[\]]'', '''', ''g''
          ), 
          '',''
        )))) AS member_name
    )
    SELECT 
      member_name,
      concat(
        ''committer-date:'',
        TO_CHAR(CURRENT_DATE - INTERVAL ''' || interval_days || ' days'', ''YYYY-MM-DD''),
        ''..'',
        TO_CHAR(CURRENT_DATE, ''YYYY-MM-DD''),
        '' author:'',
        member_name
      ) AS search_string
    FROM 
      members';
END;
$$ LANGUAGE plpgsql;