CREATE OR REPLACE FUNCTION select_from_dynamic_table(prefix text, table_name text)
RETURNS TABLE (result jsonb) AS $$
BEGIN
    RETURN QUERY EXECUTE format('SELECT row_to_json(t)::jsonb FROM %I t', concat(prefix, '_', table_name));
END;
$$ LANGUAGE plpgsql;